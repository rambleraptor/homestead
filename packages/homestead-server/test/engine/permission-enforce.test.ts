/**
 * Permissions Phase 3: enforcement wired into the engine. Enforcement is
 * unconditional and fail-closed, so these install a broad baseline by hand
 * (`installOpenGrant`; a 0ms cache TTL makes a just-created grant honored
 * immediately) and verify: a blanket grant gives ordinary CRUD; removing it
 * isolates data to owners; record, role, and deny grants take effect; and the
 * superuser break-glass.
 *
 * Nothing seeds a blanket grant any more — a household is closed by default and
 * the built-in roles enumerate the collections they cover — so the baseline here
 * is a test fixture, not the shipped shape. `deleteOpenGrant` removes it to get
 * back to what a real household looks like.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { BOOK_DEF, installOpenGrant, call, defineResource, makeEngine, seedUser, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';

describe('permission enforcement', () => {
  let t: TestEngine;
  const fetchImpl = (input: string, init?: RequestInit) => t.engine.fetch(new Request(input, init));

  beforeEach(async () => {
    process.env.PERMISSION_CACHE_TTL_MS = '0';
    t = await makeEngine();
    for (const def of PERMISSION_RESOURCE_DEFS) {
      await defineResource(
        t,
        {
          singular: def.singular,
          plural: def.plural,
          parents: def.parents ?? [],
          superuser_write: def.superuser_write ?? false,
          independent_access: def.independent_access ?? false,
          schema: toWireSchema(def.fields, def.singular),
        },
        def.singular,
      );
    }
    await defineResource(t, BOOK_DEF);
    await seedPermissions(BASE, t.adminToken, fetchImpl);
    // Seeding writes no grants; these tests narrow from an open baseline.
    await installOpenGrant(t);
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  async function deleteOpenGrant(): Promise<void> {
    const res = await call(t.engine, 'DELETE', '/access-grants/open-household', {
      token: t.adminToken,
    });
    expect(res.status).toBe(204);
  }

  test('a blanket grant gives a regular user ordinary CRUD', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    expect((await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } })).status).toBe(201);
    expect((await call(t.engine, 'GET', '/books/b1', { token: alice.token })).status).toBe(200);
    expect((await call(t.engine, 'PATCH', '/books/b1', { token: alice.token, body: { title: 'A2' } })).status).toBe(200);
    const list = await call(t.engine, 'GET', '/books', { token: alice.token });
    expect((await list.json()).results).toHaveLength(1);
    expect((await call(t.engine, 'DELETE', '/books/b1', { token: alice.token })).status).toBe(204);
  });

  test('with no matching grant, a record is visible only to its owner', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    // Alice creates while the open grant still exists (she owns it).
    expect((await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } })).status).toBe(201);

    await deleteOpenGrant();

    // Owner still reads/writes their record (owner ⇒ manage).
    expect((await call(t.engine, 'GET', '/books/b1', { token: alice.token })).status).toBe(200);
    // A non-owner is denied.
    expect((await call(t.engine, 'GET', '/books/b1', { token: bob.token })).status).toBe(403);
    // Alice can no longer create (no collection write grant remains).
    expect((await call(t.engine, 'POST', '/books?id=b2', { token: alice.token, body: { title: 'B' } })).status).toBe(403);

    // LIST is filtered to the owner's rows.
    expect((await (await call(t.engine, 'GET', '/books', { token: alice.token })).json()).results).toHaveLength(1);
    expect((await (await call(t.engine, 'GET', '/books', { token: bob.token })).json()).results).toHaveLength(0);
  });

  test('a record-scope grant lets a specific user read a specific record', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } });
    await call(t.engine, 'POST', '/books?id=b2', { token: alice.token, body: { title: 'A2' } });
    await deleteOpenGrant();

    // Share only b1 with bob.
    await call(t.engine, 'POST', '/access-grants?id=share1', {
      token: t.adminToken,
      body: {
        subject_type: 'user',
        subject_id: bob.user.id,
        target_scope: 'record',
        resource_type: 'book',
        resource_id: 'b1',
        capability: 'read',
      },
    });

    expect((await call(t.engine, 'GET', '/books/b1', { token: bob.token })).status).toBe(200);
    expect((await call(t.engine, 'GET', '/books/b2', { token: bob.token })).status).toBe(403);
    // bob's LIST shows only the shared record.
    const ids = (await (await call(t.engine, 'GET', '/books', { token: bob.token })).json()).results.map(
      (r: { id: string }) => r.id,
    );
    expect(ids).toEqual(['b1']);
  });

  test('a deny grant beats a blanket allow (deny always wins)', async () => {
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    await call(t.engine, 'POST', '/books?id=b1', { token: bob.token, body: { title: 'B' } });
    // Deny bob read everywhere.
    await call(t.engine, 'POST', '/access-grants?id=denybob', {
      token: t.adminToken,
      body: { subject_type: 'user', subject_id: bob.user.id, target_scope: 'all', capability: 'read', effect: 'deny' },
    });
    // Even his own record is now unreadable (deny beats owner).
    expect((await call(t.engine, 'GET', '/books/b1', { token: bob.token })).status).toBe(403);
    // A different user is unaffected.
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    expect((await call(t.engine, 'GET', '/books/b1', { token: alice.token })).status).toBe(200);
  });

  test('the superuser account bypasses grants and denies (break-glass)', async () => {
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    await call(t.engine, 'POST', '/books?id=b1', { token: bob.token, body: { title: 'B' } });
    await deleteOpenGrant();
    await call(t.engine, 'POST', '/access-grants?id=denyall', {
      token: t.adminToken,
      body: { subject_type: 'everyone', target_scope: 'all', capability: 'manage', effect: 'deny' },
    });
    // Superuser still reads and lists everything.
    expect((await call(t.engine, 'GET', '/books/b1', { token: t.adminToken })).status).toBe(200);
    expect((await (await call(t.engine, 'GET', '/books', { token: t.adminToken })).json()).results).toHaveLength(1);
  });

  test('user-parented resources stay owner-only even under a blanket grant', async () => {
    // The blanket everyone→write→* grant must NOT widen access to another
    // user's subtree; checkUserScope still isolates user-parented children.
    await defineResource(t, {
      singular: 'note',
      plural: 'notes',
      parents: ['user'],
      schema: { type: 'object', properties: { body: { type: 'string' } } },
    });
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });

    expect(
      (await call(t.engine, 'POST', `/users/${alice.user.id}/notes?id=n1`, { token: alice.token, body: { body: 'secret' } })).status,
    ).toBe(201);
    // Bob cannot reach Alice's note despite the open grant.
    expect((await call(t.engine, 'GET', `/users/${alice.user.id}/notes/n1`, { token: bob.token })).status).toBe(403);
    // Alice can.
    expect((await call(t.engine, 'GET', `/users/${alice.user.id}/notes/n1`, { token: alice.token })).status).toBe(200);
  });

  test('a role is additive — it grants, it does not narrow', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    await call(t.engine, 'POST', '/books?id=b1', { token: t.adminToken, body: { title: 'A' } });

    // A role that grants only *read* on the book collection, conferred via a group.
    await call(t.engine, 'POST', '/roles?id=reader', {
      token: t.adminToken,
      body: { name: 'Reader', grants: [{ target_scope: 'collection', resource_type: 'book', capability: 'read' }] },
    });
    await call(t.engine, 'POST', '/groups?id=readers', {
      token: t.adminToken,
      body: { name: 'Readers', role: 'reader' },
    });
    await call(t.engine, 'POST', '/groups/readers/group-memberships?id=m1', {
      token: t.adminToken,
      body: { user: alice.user.id },
    });

    // Access is the union of every grant that matches: Alice holds the reader
    // role *and* is covered by the blanket grant installed above, so she keeps
    // write. A role no longer suppresses anything — narrowing someone means
    // removing the grant that widens them, not layering a role on top.
    expect((await call(t.engine, 'GET', '/books/b1', { token: alice.token })).status).toBe(200);
    expect((await call(t.engine, 'POST', '/books?id=b2', { token: alice.token, body: { title: 'B' } })).status).toBe(201);

    // Bob, in no group, is covered by the same blanket grant.
    expect((await call(t.engine, 'POST', '/books?id=b3', { token: bob.token, body: { title: 'C' } })).status).toBe(201);
  });

  test('with no blanket grant, a role is the whole of a caller\'s access', async () => {
    await deleteOpenGrant();
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    await call(t.engine, 'POST', '/books?id=b1', { token: t.adminToken, body: { title: 'A' } });

    await call(t.engine, 'POST', '/roles?id=reader', {
      token: t.adminToken,
      body: { name: 'Reader', grants: [{ target_scope: 'collection', resource_type: 'book', capability: 'read' }] },
    });
    await call(t.engine, 'POST', '/groups?id=readers', {
      token: t.adminToken,
      body: { name: 'Readers', role: 'reader' },
    });
    await call(t.engine, 'POST', '/groups/readers/group-memberships?id=m1', {
      token: t.adminToken,
      body: { user: alice.user.id },
    });

    // This is the shipped shape: read from the role, and nothing else.
    expect((await call(t.engine, 'GET', '/books/b1', { token: alice.token })).status).toBe(200);
    expect((await call(t.engine, 'POST', '/books?id=b2', { token: alice.token, body: { title: 'B' } })).status).toBe(403);
    expect((await call(t.engine, 'PATCH', '/books/b1', { token: alice.token, body: { title: 'A2' } })).status).toBe(403);
  });
});

/**
 * Baseline hardening: with nothing seeded (the boot window before the
 * open-household grant lands, or a fully-wiped household), the engine must fail
 * *closed* — never expose every row to every account. A regular user falls back
 * to their own rows / a 403; the superuser (break-glass) keeps full access, so
 * the boot seeder and manual recovery always work.
 */
describe('permission enforcement — fail-closed when uninitialized', () => {
  let t: TestEngine;

  beforeEach(async () => {
    process.env.PERMISSION_CACHE_TTL_MS = '0';
    t = await makeEngine();
    // Define the permission collections + a book, but DO NOT seed roles/grants.
    for (const def of PERMISSION_RESOURCE_DEFS) {
      await defineResource(
        t,
        {
          singular: def.singular,
          plural: def.plural,
          parents: def.parents ?? [],
          superuser_write: def.superuser_write ?? false,
          independent_access: def.independent_access ?? false,
          schema: toWireSchema(def.fields, def.singular),
        },
        def.singular,
      );
    }
    await defineResource(t, BOOK_DEF);
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  test('a regular user is locked out of shared collections when no baseline exists', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    // The superuser (break-glass) still has full access — this is how the boot
    // seeder creates the baseline in the first place.
    expect((await call(t.engine, 'POST', '/books?id=b1', { token: t.adminToken, body: { title: 'A' } })).status).toBe(201);
    expect((await call(t.engine, 'GET', '/books/b1', { token: t.adminToken })).status).toBe(200);
    // A regular user with no grant can't read the admin's record, can't list it,
    // and can't create — the household is locked down, not thrown open.
    expect((await call(t.engine, 'GET', '/books/b1', { token: alice.token })).status).toBe(403);
    expect((await (await call(t.engine, 'GET', '/books', { token: alice.token })).json()).results).toHaveLength(0);
    expect((await call(t.engine, 'POST', '/books?id=b2', { token: alice.token, body: { title: 'B' } })).status).toBe(403);
  });

  test('a regular user still sees their OWN rows when no baseline exists', async () => {
    // Fail-closed isn't a full blackout: the owner⇒manage fast-path means a user
    // keeps their own records even with no grant. (An unseeded instance can't let
    // a regular user create, so seed one row directly as the row's owner.)
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    await call(t.engine, 'POST', '/books?id=mine', { token: t.adminToken, body: { title: 'A' } });
    t.engine.db.run(`UPDATE books SET _owner = ? WHERE id = 'mine'`, alice.user.id);

    expect((await call(t.engine, 'GET', '/books/mine', { token: alice.token })).status).toBe(200);
    const ids = (await (await call(t.engine, 'GET', '/books', { token: alice.token })).json()).results.map(
      (r: { id: string }) => r.id,
    );
    expect(ids).toEqual(['mine']);
  });

  test('grant writes stay superuser-only when uninitialized (baseline not tamperable)', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    // A regular user cannot create an access-grant: grant writes are governed by
    // the manage-on-target rule, which a grant-less user fails.
    const denied = await call(t.engine, 'POST', '/access-grants?id=x', {
      token: alice.token,
      body: { subject_type: 'everyone', target_scope: 'all', capability: 'write' },
    });
    expect(denied.status).toBe(403);
    // The superuser (e.g. the boot seeder) still can — this is how the baseline
    // gets created in the first place.
    const ok = await call(t.engine, 'POST', '/access-grants?id=open', {
      token: t.adminToken,
      body: { subject_type: 'everyone', target_scope: 'all', capability: 'write' },
    });
    expect(ok.status).toBe(201);
  });
});
