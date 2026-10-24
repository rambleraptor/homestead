/**
 * Collection privacy, without a per-resource access model.
 *
 * There used to be an `access: { model }` declaration on a resource — `owner` /
 * `acl` — whose only job was to say "the blanket household grant doesn't reach
 * me". With no blanket left to opt out of (the household roles name the
 * collections they cover, one by one), the declaration is gone and privacy is
 * simply the absence of a grant. These pin that behavior, because it's what the
 * documents app's per-folder sharing rests on:
 *
 *   - a collection some grant covers is shared;
 *   - a collection no grant covers is private to each row's owner — while
 *     CREATE still works, so people can always add records they'll own;
 *   - a collection-scope grant opens the whole collection;
 *   - a record-scope grant opens exactly one row.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { OWN_ROWS_FILTER } from '@rambleraptor/homestead-core/permissions/household';
import { call, defineResource, makeEngine, seedUser, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';

async function define(t: TestEngine, singular: string, plural: string) {
  return defineResource(
    t,
    {
      singular,
      plural,
      user_settable_create: true,
      schema: { type: 'object', properties: { title: { type: 'string' } } },
    },
    singular,
  );
}

async function listIds(t: TestEngine, plural: string, token: string): Promise<string[]> {
  const res = await call(t.engine, 'GET', `/${plural}`, { token });
  return ((await res.json()).results as Array<{ id: string }>).map((r) => r.id).sort();
}

describe('collection privacy is the absence of a grant', () => {
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
    await define(t, 'book', 'books');
    await define(t, 'doc', 'docs');
    // `book` is shared household-wide; `doc` is covered only for a member's own
    // rows — the same split `householdCollections` makes between an ordinary app
    // and the documents app.
    await seedPermissions(BASE, t.adminToken, fetchImpl, [
      { resource_type: 'book' },
      { resource_type: 'doc', filter: OWN_ROWS_FILTER },
    ]);
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  /** Seed a user and give them the Member role via the seeded group. */
  async function member(email: string, membershipId: string) {
    const u = await seedUser(t.engine, { email });
    await call(t.engine, 'POST', `/groups/members/group-memberships?id=${membershipId}`, {
      token: t.adminToken,
      body: { user: u.user.id },
    });
    return u;
  }

  test('a collection the Member role covers is shared across the household', async () => {
    const alice = await member('alice@example.com', 'm1');
    const bob = await member('bob@example.com', 'm2');
    expect(
      (await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } })).status,
    ).toBe(201);
    expect((await call(t.engine, 'GET', '/books/b1', { token: bob.token })).status).toBe(200);
    expect(await listIds(t, 'books', bob.token)).toEqual(['b1']);
  });

  test('a collection no role covers is private to each row owner', async () => {
    const alice = await member('alice@example.com', 'm1');
    const bob = await member('bob@example.com', 'm2');
    // CREATE is never gated by privacy — you can always add a record you'll own.
    expect(
      (await call(t.engine, 'POST', '/docs?id=d1', { token: alice.token, body: { title: 'secret' } })).status,
    ).toBe(201);

    expect((await call(t.engine, 'GET', '/docs/d1', { token: alice.token })).status).toBe(200);
    expect((await call(t.engine, 'GET', '/docs/d1', { token: bob.token })).status).toBe(403);
    expect(await listIds(t, 'docs', bob.token)).toEqual([]);
    expect(await listIds(t, 'docs', alice.token)).toEqual(['d1']);
  });

  test('a collection-scope grant opens the whole collection', async () => {
    const alice = await member('alice@example.com', 'm1');
    const bob = await member('bob@example.com', 'm2');
    await call(t.engine, 'POST', '/docs?id=d1', { token: alice.token, body: { title: 'A' } });

    await call(t.engine, 'POST', '/access-grants?id=opendocs', {
      token: t.adminToken,
      body: {
        subject_type: 'everyone',
        target_scope: 'collection',
        resource_type: 'doc',
        capability: 'read',
      },
    });

    expect((await call(t.engine, 'GET', '/docs/d1', { token: bob.token })).status).toBe(200);
    expect(await listIds(t, 'docs', bob.token)).toEqual(['d1']);
  });

  test('a record-scope grant opens exactly one row', async () => {
    const alice = await member('alice@example.com', 'm1');
    const bob = await member('bob@example.com', 'm2');
    await call(t.engine, 'POST', '/docs?id=d1', { token: alice.token, body: { title: 'A' } });
    await call(t.engine, 'POST', '/docs?id=d2', { token: alice.token, body: { title: 'B' } });

    await call(t.engine, 'POST', '/access-grants?id=shared1', {
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

    expect((await call(t.engine, 'GET', '/docs/d1', { token: bob.token })).status).toBe(200);
    expect((await call(t.engine, 'GET', '/docs/d2', { token: bob.token })).status).toBe(403);
    expect(await listIds(t, 'docs', bob.token)).toEqual(['d1']);
  });
});
