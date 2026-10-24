/**
 * Permissions Phase 4: filter-scoped grants. The shared compileFilter gains a
 * `subject.*` binding (List behavior unchanged); a collection-scope grant with
 * a filter grants/denies only the records matching it, evaluated identically
 * for single-record ops and LIST.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { compileFilter } from '../../src/engine/filter';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { installOpenGrant, call, defineResource, makeEngine, seedUser, type TestEngine } from './helpers';

const SCHEMA = { type: 'object' as const, properties: { created_by: { type: 'string' }, status: { type: 'string' } } };

describe('compileFilter subject.* binding', () => {
  test('binds a subject attribute as a parameter', () => {
    const c = compileFilter('created_by == subject.id', SCHEMA, { subject: { id: 'alice' } });
    expect(c.sql).toBe('created_by = ?');
    expect(c.params).toEqual(['alice']);
  });

  test('subject.* without a subject context is an unknown field (List behavior)', () => {
    expect(() => compileFilter('created_by == subject.id', SCHEMA)).toThrow(/unknown field/);
  });

  test('an unlisted subject attribute is rejected', () => {
    expect(() => compileFilter('created_by == subject.ssn', SCHEMA, { subject: { id: 'a' } })).toThrow(
      /unknown field/,
    );
  });

  test('ordinary List filters are unaffected', () => {
    const c = compileFilter("status == 'open'", SCHEMA);
    expect(c.params).toEqual(['open']);
  });
});

describe('filter-scoped grant enforcement', () => {
  let t: TestEngine;
  const BASE = 'http://localhost:8090';
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
    await defineResource(t, {
      singular: 'doc',
      plural: 'docs',
      user_settable_create: true,
      schema: {
        type: 'object',
        properties: {
          created_by: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string' },
          collections: { type: 'array', items: { type: 'string' } },
        },
      },
    });
    await seedPermissions(BASE, t.adminToken, fetchImpl);
    // Seeding writes no grants; these tests narrow from an open baseline.
    await installOpenGrant(t);
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  test('"records where created_by == subject.id" scopes read + list per caller', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    // Each creates a doc tagging themselves as author (open grant still present).
    await call(t.engine, 'POST', '/docs?id=d1', { token: alice.token, body: { title: 'A', created_by: alice.user.id } });
    await call(t.engine, 'POST', '/docs?id=d2', { token: bob.token, body: { title: 'B', created_by: bob.user.id } });

    // Tighten: replace the open grant with an author-scoped filter grant.
    await call(t.engine, 'DELETE', '/access-grants/open-household', { token: t.adminToken });
    await call(t.engine, 'POST', '/access-grants?id=authors', {
      token: t.adminToken,
      body: {
        subject_type: 'everyone',
        target_scope: 'collection',
        resource_type: 'doc',
        filter: 'created_by == subject.id',
        capability: 'read',
      },
    });

    // Single-record: each sees their own, not the other's.
    expect((await call(t.engine, 'GET', '/docs/d1', { token: alice.token })).status).toBe(200);
    expect((await call(t.engine, 'GET', '/docs/d2', { token: alice.token })).status).toBe(403);
    expect((await call(t.engine, 'GET', '/docs/d1', { token: bob.token })).status).toBe(403);

    // LIST is filtered identically.
    const aliceIds = (await (await call(t.engine, 'GET', '/docs', { token: alice.token })).json()).results.map(
      (r: { id: string }) => r.id,
    );
    expect(aliceIds).toEqual(['d1']);
    const bobIds = (await (await call(t.engine, 'GET', '/docs', { token: bob.token })).json()).results.map(
      (r: { id: string }) => r.id,
    );
    expect(bobIds).toEqual(['d2']);
  });

  test('"<collection> in collections" scopes access to a shared collection', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    // Alice authors three docs; two belong to collection c1, one to c2.
    await call(t.engine, 'POST', '/docs?id=d1', { token: alice.token, body: { title: 'A', collections: ['c1'] } });
    await call(t.engine, 'POST', '/docs?id=d2', { token: alice.token, body: { title: 'B', collections: ['c1', 'c2'] } });
    await call(t.engine, 'POST', '/docs?id=d3', { token: alice.token, body: { title: 'C', collections: ['c2'] } });

    // Lock docs down to their owner, then share collection c1 with Bob — exactly
    // the grant the documents app writes when a collection is shared.
    await call(t.engine, 'DELETE', '/access-grants/open-household', { token: t.adminToken });
    await call(t.engine, 'POST', '/access-grants?id=owner', {
      token: t.adminToken,
      body: {
        subject_type: 'everyone',
        target_scope: 'collection',
        resource_type: 'doc',
        filter: 'created_by == subject.id',
        capability: 'write',
      },
    });
    await call(t.engine, 'POST', '/access-grants?id=share-c1-bob', {
      token: t.adminToken,
      body: {
        subject_type: 'user',
        subject_id: bob.user.id,
        target_scope: 'collection',
        resource_type: 'doc',
        filter: "'c1' in collections",
        capability: 'write',
      },
    });

    // Bob sees only the two docs in the shared collection c1.
    const bobIds = (await (await call(t.engine, 'GET', '/docs', { token: bob.token })).json()).results.map(
      (r: { id: string }) => r.id,
    );
    expect(bobIds.sort()).toEqual(['d1', 'd2']);
    expect((await call(t.engine, 'GET', '/docs/d1', { token: bob.token })).status).toBe(200);
    expect((await call(t.engine, 'GET', '/docs/d3', { token: bob.token })).status).toBe(403);
    // Alice still sees all of her own docs.
    const aliceIds = (await (await call(t.engine, 'GET', '/docs', { token: alice.token })).json()).results.map(
      (r: { id: string }) => r.id,
    );
    expect(aliceIds.sort()).toEqual(['d1', 'd2', 'd3']);
  });

  test('a deny filter subtracts from an otherwise-broad allow', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    await call(t.engine, 'POST', '/docs?id=d1', { token: alice.token, body: { title: 'ok', status: 'active' } });
    await call(t.engine, 'POST', '/docs?id=d2', { token: alice.token, body: { title: 'secret', status: 'archived' } });

    // Open grant (everyone write *) remains → broad read; add a deny filter.
    await call(t.engine, 'POST', '/access-grants?id=hidearchived', {
      token: t.adminToken,
      body: {
        subject_type: 'everyone',
        target_scope: 'collection',
        resource_type: 'doc',
        filter: "status == 'archived'",
        capability: 'read',
        effect: 'deny',
      },
    });

    const ids = (await (await call(t.engine, 'GET', '/docs', { token: alice.token })).json()).results.map(
      (r: { id: string }) => r.id,
    );
    expect(ids).toEqual(['d1']); // archived doc subtracted
    expect((await call(t.engine, 'GET', '/docs/d2', { token: alice.token })).status).toBe(403);
  });
});
