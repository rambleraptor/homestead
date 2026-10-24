/**
 * End-to-end (in-process) check that the real permission resource definitions
 * are accepted by the meta API and that the boot seeder creates the baseline
 * roles + open grant idempotently. Mirrors what schema-sync does at boot.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { call, defineResource, makeEngine, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';

async function defineAll(t: TestEngine): Promise<void> {
  for (const def of PERMISSION_RESOURCE_DEFS) {
    const res = await defineResource(
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
    expect(res.status, `define ${def.singular}`).toBeLessThan(300);
  }
}

async function listIds(t: TestEngine, plural: string): Promise<string[]> {
  const res = await call(t.engine, 'GET', `/${plural}`, { token: t.adminToken });
  const body = (await res.json()) as { results?: Array<{ id: string }> };
  return (body.results ?? []).map((r) => r.id).sort();
}

describe('permission resources + seed at boot', () => {
  let t: TestEngine;
  const fetchImpl = (input: string, init?: RequestInit) => t.engine.fetch(new Request(input, init));

  beforeEach(async () => {
    t = await makeEngine();
    await defineAll(t);
  });

  test('the real definitions are accepted by the meta API', async () => {
    // defineAll asserts each create succeeded; a follow-up GET confirms they route.
    const res = await call(t.engine, 'GET', '/roles', { token: t.adminToken });
    expect(res.status).toBe(200);
  });

  test('seeding creates admin/member/guest and the role-bearing groups, and no grants', async () => {
    await seedPermissions(BASE, t.adminToken, fetchImpl, [{ resource_type: 'book' }]);

    expect(await listIds(t, 'roles')).toEqual(['admin', 'guest', 'member']);
    expect(await listIds(t, 'groups')).toEqual(['admins', 'guests', 'members']);
    // Closed by default: a freshly seeded household grants nothing to anyone.
    // Access comes from the role a group confers, or from an explicit share.
    expect(await listIds(t, 'access-grants')).toEqual([]);

    // Each seeded group confers its matching role, so the create-user picker
    // can offer "Access level: Admin / Member / Guest".
    const members = await call(t.engine, 'GET', '/groups/members', { token: t.adminToken });
    const membersGroup = await members.json();
    expect(membersGroup.name).toBe('Members');
    expect(membersGroup.role).toBe('member');

    // The household roles name the collections they cover one by one — no grant
    // anywhere is `all`-scope. Seeded here with the `book` collection as the
    // household's declared set (see the seedPermissions call above).
    const member = await call(t.engine, 'GET', '/roles/member', { token: t.adminToken });
    expect((await member.json()).grants).toEqual([
      { target_scope: 'collection', resource_type: 'book', capability: 'write' },
    ]);
    const admin = await call(t.engine, 'GET', '/roles/admin', { token: t.adminToken });
    expect((await admin.json()).grants).toEqual([
      { target_scope: 'collection', resource_type: 'book', capability: 'manage' },
    ]);
  });

  test('seeding is idempotent (seed-when-empty)', async () => {
    await seedPermissions(BASE, t.adminToken, fetchImpl, [{ resource_type: 'book' }]);
    await seedPermissions(BASE, t.adminToken, fetchImpl, [{ resource_type: 'book' }]);
    expect(await listIds(t, 'roles')).toEqual(['admin', 'guest', 'member']);
    expect(await listIds(t, 'groups')).toEqual(['admins', 'guests', 'members']);
    expect(await listIds(t, 'access-grants')).toEqual([]);
  });

  test('a household that has curated its own grants is left alone', async () => {
    await seedPermissions(BASE, t.adminToken, fetchImpl, [{ resource_type: 'book' }]);
    await call(t.engine, 'POST', '/access-grants?id=custom', {
      token: t.adminToken,
      body: { subject_type: 'everyone', target_scope: 'app', target_app: 'recipes', capability: 'read' },
    });

    await seedPermissions(BASE, t.adminToken, fetchImpl, [{ resource_type: 'book' }]);
    // Seeding never writes a grant, so a hand-made one is all that remains.
    expect(await listIds(t, 'access-grants')).toEqual(['custom']);
  });
});
