/**
 * engine.permissionContext(userId) feeds the client `can()` mirror: the caller's
 * group ids, all applicable grants (role bundles expanded), and whether
 * enforcement is live. Enforcement is unconditional and fail-closed, so
 * `enforced` is always true and the client gates exactly as the server does.
 * Backs GET /api/permissions/me.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { call, defineResource, makeEngine, seedUser, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';

describe('engine.permissionContext', () => {
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
    await seedPermissions(BASE, t.adminToken, fetchImpl, [{ resource_type: 'book' }]);
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  test('returns group ids, expanded grants, and the enforced flag', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    // The group confers the `member` role on all its members (group-level role).
    await call(t.engine, 'POST', '/groups?id=parents', {
      token: t.adminToken,
      body: { name: 'Parents', role: 'member' },
    });
    await call(t.engine, 'POST', '/groups/parents/group-memberships?id=m1', {
      token: t.adminToken,
      body: { user: alice.user.id },
    });

    const ctx = t.engine.permissionContext(alice.user.id);

    // A baseline was seeded (roles + groups), so enforcement is live.
    expect(ctx.enforced).toBe(true);
    expect(ctx.groupIds).toEqual(['parents']);
    // Group *names* also ride along for the app-gating mirror (§9.2).
    expect(ctx.groupNames).toEqual(['Parents']);
    // Nothing is granted household-wide, so there is no everyone grant at all.
    expect(ctx.grants.some((g) => g.subject.type === 'everyone')).toBe(false);
    // Alice's access is the `member` role, expanded into grants addressed to her
    // — one per collection the role covers, never a single `all`-scope grant.
    const hers = ctx.grants.filter(
      (g) => g.subject.type === 'user' && g.subject.id === alice.user.id,
    );
    expect(hers.length).toBeGreaterThan(0);
    expect(hers.every((g) => g.target.scope === 'collection' && g.capability === 'write')).toBe(true);
  });

  test('enforced is true even before a baseline is seeded (fail-closed)', async () => {
    // A fresh engine with no roles/grants seeded still reports enforced: the
    // engine is fail-closed, so the client must gate as the server does rather
    // than stay permissive. A grant-less caller simply resolves to their own rows.
    const fresh = await makeEngine();
    const alice = await seedUser(fresh.engine, { email: 'nobody@example.com' });
    expect(fresh.engine.permissionContext(alice.user.id).enforced).toBe(true);
  });
});
