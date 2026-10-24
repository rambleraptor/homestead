/**
 * `collectionsWithVisibleRows` — the server half of sidebar visibility.
 *
 * It answers only the question the client can't: for a collection reached
 * through a *filtered* grant, does the caller actually have a row? The client
 * resolver refuses to evaluate filters (`canWith` passes no `filterEval`), so
 * without this a documents app you can genuinely use looks unreachable.
 *
 * The contract these pin down:
 *   - a collection the grants already allow is omitted (nothing to add, and no
 *     query runs — that's what keeps this cheap);
 *   - a filtered collection appears only while the caller has a visible row;
 *   - someone else's rows never count;
 *   - a superuser gets an empty list, since the client short-circuits them.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { OWN_ROWS_FILTER } from '@rambleraptor/homestead-core/permissions/household';
import { call, defineResource, makeEngine, seedUser, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';

describe('collectionsWithVisibleRows', () => {
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
    for (const [singular, plural] of [
      ['book', 'books'],
      ['doc', 'docs'],
    ]) {
      await defineResource(
        t,
        {
          singular,
          plural,
          user_settable_create: true,
          schema: {
            type: 'object',
            properties: { title: { type: 'string' }, created_by: { type: 'string' } },
          },
        },
        singular,
      );
    }
    // `book` shared outright; `doc` only for a member's own rows.
    await seedPermissions(BASE, t.adminToken, fetchImpl, [
      { resource_type: 'book' },
      { resource_type: 'doc', filter: OWN_ROWS_FILTER },
    ]);
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  /** Seed a user holding the Member role via the seeded group. */
  async function member(email: string, membershipId: string) {
    const u = await seedUser(t.engine, { email });
    await call(t.engine, 'POST', `/groups/members/group-memberships?id=${membershipId}`, {
      token: t.adminToken,
      body: { user: u.user.id },
    });
    return u;
  }

  function withRows(userId: string): string[] {
    return t.engine.permissionContext(userId).collectionsWithRows;
  }

  test('omits a collection the grants already allow', async () => {
    const alice = await member('alice@example.com', 'm1');
    await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } });
    // `book` is granted outright, so the client answers it without help — and no
    // existence query runs for it.
    expect(withRows(alice.user.id)).not.toContain('book');
  });

  test('reports a filtered collection only once the caller has a row', async () => {
    const alice = await member('alice@example.com', 'm1');
    expect(withRows(alice.user.id)).not.toContain('doc');

    await call(t.engine, 'POST', '/docs?id=d1', {
      token: alice.token,
      body: { title: 'mine', created_by: alice.user.id },
    });
    expect(withRows(alice.user.id)).toContain('doc');
  });

  test("does not count another member's rows", async () => {
    const alice = await member('alice@example.com', 'm1');
    const bob = await member('bob@example.com', 'm2');
    await call(t.engine, 'POST', '/docs?id=d1', {
      token: alice.token,
      body: { title: 'mine', created_by: alice.user.id },
    });

    expect(withRows(alice.user.id)).toContain('doc');
    expect(withRows(bob.user.id)).not.toContain('doc');
  });

  test('drops the collection again when the last visible row goes', async () => {
    const alice = await member('alice@example.com', 'm1');
    await call(t.engine, 'POST', '/docs?id=d1', {
      token: alice.token,
      body: { title: 'mine', created_by: alice.user.id },
    });
    expect(withRows(alice.user.id)).toContain('doc');

    expect((await call(t.engine, 'DELETE', '/docs/d1', { token: alice.token })).status).toBe(204);
    expect(withRows(alice.user.id)).not.toContain('doc');
  });

  test('a record-scope share makes the collection reachable', async () => {
    const alice = await member('alice@example.com', 'm1');
    const bob = await member('bob@example.com', 'm2');
    await call(t.engine, 'POST', '/docs?id=d1', {
      token: alice.token,
      body: { title: 'mine', created_by: alice.user.id },
    });
    await call(t.engine, 'POST', '/access-grants?id=share1', {
      token: t.adminToken,
      body: {
        subject_type: 'user',
        subject_id: bob.user.id,
        target_scope: 'record',
        resource_type: 'doc',
        resource_id: 'd1',
        capability: 'read',
      },
    });

    expect(withRows(bob.user.id)).toContain('doc');
  });

  test('is empty for a superuser (the client short-circuits them)', async () => {
    await call(t.engine, 'POST', '/docs?id=d1', {
      token: t.adminToken,
      body: { title: 'admin doc' },
    });
    const admin = t.engine.permissionContext(t.admin.id);
    expect(admin.collectionsWithRows).toEqual([]);
  });
});
