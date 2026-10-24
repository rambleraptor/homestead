/**
 * Permissions Phase 4 follow-up: write-time validation of an access-grant's
 * `filter`. A collection-scope filter must compile against its target
 * collection's schema, so a broken expression (bad syntax, an unknown field
 * after a rename) is rejected at grant create/update with a 400 — instead of
 * silently failing open at enforcement time, where an un-compilable deny-filter
 * would quietly stop applying.
 *
 * Validation runs after the manage-on-target authz check but is independent of
 * it: it's a data-integrity guard, so even the break-glass superuser gets a 400
 * on a malformed filter. These tests use the superuser token to isolate filter
 * validation from the authorization rule (covered separately).
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { BOOK_DEF, call, defineResource, makeEngine, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';

describe('access-grant write-time filter validation', () => {
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
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  function collectionGrant(filter: string) {
    return {
      subject_type: 'everyone',
      target_scope: 'collection',
      resource_type: 'book',
      filter,
      capability: 'read',
    };
  }

  test('a collection filter that compiles against the target schema is accepted', async () => {
    const res = await call(t.engine, 'POST', '/access-grants?id=g1', {
      token: t.adminToken,
      body: collectionGrant('title == "Dune"'),
    });
    expect(res.status).toBe(201);
  });

  test('a filter that binds subject.* is accepted (subject-aware compile)', async () => {
    const res = await call(t.engine, 'POST', '/access-grants?id=g2', {
      token: t.adminToken,
      body: collectionGrant('title == subject.email'),
    });
    expect(res.status).toBe(201);
  });

  test('a filter naming a field the target schema lacks is rejected (400)', async () => {
    const res = await call(t.engine, 'POST', '/access-grants?id=g3', {
      token: t.adminToken,
      body: collectionGrant('nonexistent_field == "x"'),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('invalid grant filter');
  });

  test('a syntactically broken filter is rejected (400)', async () => {
    const res = await call(t.engine, 'POST', '/access-grants?id=g4', {
      token: t.adminToken,
      body: collectionGrant('title =='),
    });
    expect(res.status).toBe(400);
  });

  test('a PATCH that introduces a broken filter is rejected (400)', async () => {
    // Seed a valid grant, then try to drift its filter to an unknown field.
    expect(
      (await call(t.engine, 'POST', '/access-grants?id=g5', {
        token: t.adminToken,
        body: collectionGrant('title == "ok"'),
      })).status,
    ).toBe(201);

    const res = await call(t.engine, 'PATCH', '/access-grants/g5', {
      token: t.adminToken,
      body: { filter: 'gone_after_rename == "x"' },
      contentType: 'application/merge-patch+json',
    });
    expect(res.status).toBe(400);
  });

  test('a bad filter on a non-collection scope is not validated (resolver ignores it there)', async () => {
    await call(t.engine, 'POST', '/books?id=b1', { token: t.adminToken, body: { title: 'A' } });
    // record-scope: filter is inert, so a garbage value must not block the write.
    const res = await call(t.engine, 'POST', '/access-grants?id=g6', {
      token: t.adminToken,
      body: {
        subject_type: 'everyone',
        target_scope: 'record',
        resource_type: 'book',
        resource_id: 'b1',
        filter: 'this is not a filter',
        capability: 'read',
      },
    });
    expect(res.status).toBe(201);
  });
});
