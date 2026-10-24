/**
 * Permissions Phase 3b: the access-grant manage-on-target write rule (§15.3).
 * A non-superuser may write a grant only when they have `manage` on the grant's
 * target (owner⇒manage covers "share my own record"); grants targeting the ACL
 * machinery itself are rejected. Reads stay open to authenticated callers.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { BOOK_DEF, installOpenGrant, call, defineResource, makeEngine, seedUser, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';

describe('access-grant manage-on-target write rule', () => {
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
    await seedPermissions(BASE, t.adminToken, fetchImpl, [{ resource_type: 'book' }]);
    // Seeding writes no grants; these tests narrow from an open baseline.
    await installOpenGrant(t);
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  function shareBody(subjectId: string, recordId: string) {
    return {
      subject_type: 'user',
      subject_id: subjectId,
      target_scope: 'record',
      resource_type: 'book',
      resource_id: recordId,
      capability: 'read',
    };
  }

  test('an owner may share their own record; a non-owner may not', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } });

    // Alice owns b1 (owner⇒manage) → may create a record-share for it.
    expect(
      (await call(t.engine, 'POST', '/access-grants?id=s1', { token: alice.token, body: shareBody(bob.user.id, 'b1') })).status,
    ).toBe(201);

    // Bob does not own b1 → may not share it.
    expect(
      (await call(t.engine, 'POST', '/access-grants?id=s2', { token: bob.token, body: shareBody(alice.user.id, 'b1') })).status,
    ).toBe(403);
  });

  test('a member (write via the open grant) cannot create a collection/all grant', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    // No manage anywhere (the open grant is write, not manage).
    expect(
      (await call(t.engine, 'POST', '/access-grants?id=c1', {
        token: alice.token,
        body: { subject_type: 'user', subject_id: alice.user.id, target_scope: 'collection', resource_type: 'book', capability: 'read' },
      })).status,
    ).toBe(403);
    expect(
      (await call(t.engine, 'POST', '/access-grants?id=a1', {
        token: alice.token,
        body: { subject_type: 'everyone', target_scope: 'all', capability: 'read' },
      })).status,
    ).toBe(403);
  });

  test('a user with the admin role (via a group) can create broad grants', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    // Admin makes a group and puts Alice in it with the seeded `admin` role.
    // The group confers the `admin` role on its members (group-level role).
    await call(t.engine, 'POST', '/groups?id=admins', {
      token: t.adminToken,
      body: { name: 'Admins', role: 'admin' },
    });
    await call(t.engine, 'POST', '/groups/admins/group-memberships?id=m1', {
      token: t.adminToken,
      body: { user: alice.user.id },
    });

    // The admin role confers manage on every household collection (here just
    // `book`), so Alice may create a grant targeting one.
    expect(
      (await call(t.engine, 'POST', '/access-grants?id=c1', {
        token: alice.token,
        body: { subject_type: 'everyone', target_scope: 'collection', resource_type: 'book', capability: 'read' },
      })).status,
    ).toBe(201);
  });

  test('no grants-on-grants: even an admin-role user cannot target the ACL machinery', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    // The group confers the `admin` role on its members (group-level role).
    await call(t.engine, 'POST', '/groups?id=admins', {
      token: t.adminToken,
      body: { name: 'Admins', role: 'admin' },
    });
    await call(t.engine, 'POST', '/groups/admins/group-memberships?id=m1', {
      token: t.adminToken,
      body: { user: alice.user.id },
    });
    for (const targetType of ['access-grant', 'role', 'group', 'group-membership']) {
      const res = await call(t.engine, 'POST', `/access-grants?id=x-${targetType}`, {
        token: alice.token,
        body: { subject_type: 'everyone', target_scope: 'collection', resource_type: targetType, capability: 'read' },
      });
      expect(res.status, `target ${targetType}`).toBe(403);
    }
  });

  test('the superuser may write any grant (break-glass), and delete honors the rule', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } });
    // Superuser creates an all-scope grant freely.
    expect(
      (await call(t.engine, 'POST', '/access-grants?id=a1', {
        token: t.adminToken,
        body: { subject_type: 'everyone', target_scope: 'all', capability: 'read' },
      })).status,
    ).toBe(201);

    // Alice shares b1, then only she (owner⇒manage) or a superuser can delete it.
    await call(t.engine, 'POST', '/access-grants?id=s1', { token: alice.token, body: shareBody(bob.user.id, 'b1') });
    expect((await call(t.engine, 'DELETE', '/access-grants/s1', { token: bob.token })).status).toBe(403);
    expect((await call(t.engine, 'DELETE', '/access-grants/s1', { token: alice.token })).status).toBe(204);
  });

  test('grant reads stay open to authenticated callers (hydration)', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    expect((await call(t.engine, 'GET', '/access-grants', { token: alice.token })).status).toBe(200);
    expect((await call(t.engine, 'GET', '/access-grants/open-household', { token: alice.token })).status).toBe(200);
  });
});
