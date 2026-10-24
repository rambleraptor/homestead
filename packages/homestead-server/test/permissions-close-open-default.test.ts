/**
 * The `permissions-close-open-default` migration, end to end against a real
 * engine.
 *
 * The migration is the bridge between two worlds: instances seeded before the
 * closed-by-default change carry an `everyone → write on *` grant that *is* every
 * ungrouped user's access, so it can't simply be deleted. These cases pin the
 * three behaviors that make removing it safe:
 *
 *   1. an ungrouped user is moved onto the Member role before the grant goes, so
 *      their effective access is unchanged;
 *   2. a user who already has an admin-chosen role is left exactly as they are;
 *   3. with people to park and nowhere to put them, the grant is *kept* and the
 *      handler throws — a household is never locked out of its own data, and a
 *      bail recorded as `succeeded` would never retry;
 *   4. with nobody to park, a missing Members group is irrelevant and the grant
 *      goes anyway — the case that left a real household open.
 *
 * The handler builds its own client through `serverClient`, which targets
 * `AEPBASE_URL`, so these stub `globalThis.fetch` to route that origin at the
 * in-process engine. In a running server the `/api/aep` gateway does this.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import type { MigrationHandler } from '@rambleraptor/homestead-core/apps/migrations';
import {
  call,
  defineResource,
  installOpenGrant,
  makeEngine,
  seedUser,
  type TestEngine,
} from './engine/helpers';

const BASE = 'http://localhost:8090';

/** Ids the seeder writes; the migration looks the member group up by role. */
const MEMBERS = 'members';
const ADMINS = 'admins';
const OPEN_GRANT = 'open-household';

describe('permissions-close-open-default migration', () => {
  let t: TestEngine;
  let realFetch: typeof globalThis.fetch;
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
    await seedPermissions(BASE, t.adminToken, fetchImpl);

    // Route the handler's `serverClient` (which targets AEPBASE_URL) at the
    // in-process engine, stripping the `/api/aep` prefix the gateway owns.
    realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      url.pathname = url.pathname.replace(/^\/api\/aep/, '');
      return t.engine.fetch(new Request(url.toString(), init));
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  /** Import fresh each time — the handler holds no state, but the ledger does. */
  async function runMigration(): Promise<Record<string, unknown> | void> {
    const mod = (await import(
      '@rambleraptor/homestead-core/permissions/migrations/close-open-default'
    )) as { default: MigrationHandler };
    return mod.default({
      id: 'permissions-close-open-default',
      appId: 'permissions',
      token: t.adminToken,
      log: async () => {},
    });
  }

  async function memberIdsOf(groupId: string): Promise<string[]> {
    const res = await call(t.engine, 'GET', `/groups/${groupId}/group-memberships`, {
      token: t.adminToken,
    });
    const body = (await res.json()) as { results: { user: string }[] };
    return body.results.map((m) => m.user);
  }

  async function grantIds(): Promise<string[]> {
    const res = await call(t.engine, 'GET', '/access-grants', { token: t.adminToken });
    return ((await res.json()) as { results: { id: string }[] }).results.map((g) => g.id);
  }

  test('moves ungrouped users onto Member, then deletes the open grant', async () => {
    await installOpenGrant(t);
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });

    const result = (await runMigration()) as Record<string, unknown>;

    expect(result.openGrant).toBe('deleted');
    expect(result.joined).toBe(2);
    // Both were riding the open grant; both now hold the Member role instead.
    expect((await memberIdsOf(MEMBERS)).sort()).toEqual([alice.user.id, bob.user.id].sort());
    expect(await grantIds()).not.toContain(OPEN_GRANT);
  });

  test('leaves a user who already has a role alone', async () => {
    await installOpenGrant(t);
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const carol = await seedUser(t.engine, { email: 'carol@example.com' });
    // Carol's access was already chosen by an admin — she must not be demoted
    // to Member, and must not end up holding two roles.
    await call(t.engine, 'POST', `/groups/${ADMINS}/group-memberships`, {
      token: t.adminToken,
      body: { user: carol.user.id },
    });

    const result = (await runMigration()) as Record<string, unknown>;

    expect(result.joined).toBe(1);
    expect(await memberIdsOf(MEMBERS)).toEqual([alice.user.id]);
    expect(await memberIdsOf(ADMINS)).toEqual([carol.user.id]);
  });

  test('skips superusers — break-glass makes a role inert for them', async () => {
    await installOpenGrant(t);
    await seedUser(t.engine, { email: 'root@example.com', type: 'superuser' });

    const result = (await runMigration()) as Record<string, unknown>;

    // The engine's own bootstrap superuser is present too; neither is joined.
    expect(result.joined).toBe(0);
    expect(await memberIdsOf(MEMBERS)).toEqual([]);
  });

  test('is a no-op on an already-closed household', async () => {
    // No open grant: either a fresh instance, or one an admin locked down on
    // purpose. Joining people to Members here would silently re-open it.
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });

    const result = (await runMigration()) as Record<string, unknown>;

    expect(result.openGrant).toBe('absent');
    expect(await memberIdsOf(MEMBERS)).toEqual([]);
    expect(alice.user.id).toBeTruthy();
  });

  test('re-running after a successful pass changes nothing', async () => {
    await installOpenGrant(t);
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });

    await runMigration();
    const second = (await runMigration()) as Record<string, unknown>;

    expect(second.openGrant).toBe('absent');
    expect(await memberIdsOf(MEMBERS)).toEqual([alice.user.id]);
  });

  test('throws and keeps the grant when people need a role and none confers it', async () => {
    await installOpenGrant(t);
    await seedUser(t.engine, { email: 'alice@example.com' });
    // The household deleted the Members group; Alice has nowhere to go.
    expect(
      (await call(t.engine, 'DELETE', `/groups/${MEMBERS}`, { token: t.adminToken })).status,
    ).toBe(204);

    // Throwing, not returning: the runner records a *failed* migration and
    // retries next boot. A plain return is recorded as `succeeded` and skipped
    // forever, which would leave the household open for good.
    await expect(runMigration()).rejects.toThrow(/member.*role/i);

    // Bailing beats locking the household out of its own data.
    expect(await grantIds()).toContain(OPEN_GRANT);
  });

  test('deletes the grant with no Members group when every user already has a role', async () => {
    await installOpenGrant(t);
    const carol = await seedUser(t.engine, { email: 'carol@example.com' });
    // Carol's access is already admin-chosen, so nobody is riding the open
    // grant — and with nobody to park, the absent Members group is irrelevant.
    await call(t.engine, 'POST', `/groups/${ADMINS}/group-memberships`, {
      token: t.adminToken,
      body: { user: carol.user.id },
    });
    expect(
      (await call(t.engine, 'DELETE', `/groups/${MEMBERS}`, { token: t.adminToken })).status,
    ).toBe(204);

    const result = (await runMigration()) as Record<string, unknown>;

    expect(result.openGrant).toBe('deleted');
    expect(result.joined).toBe(0);
    expect(await grantIds()).not.toContain(OPEN_GRANT);
    // Carol keeps the role an admin gave her; she was never touched.
    expect(await memberIdsOf(ADMINS)).toEqual([carol.user.id]);
  });
});
