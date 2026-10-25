/**
 * `Engine.householdMembers` — who shares this Homestead: every superuser, plus
 * anyone holding the Admin or Member role through any group. A guest, or an
 * account in no group, is not in it.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { call, defineResource, makeEngine, seedUser, type TestEngine } from './helpers';

let t: TestEngine;

async function join(groupId: string, userId: string): Promise<void> {
  const res = await call(t.engine, 'POST', `/groups/${groupId}/group-memberships`, {
    token: t.adminToken,
    body: { user: userId },
  });
  expect(res.status).toBe(201);
}

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
  await seedPermissions('http://localhost:8090', t.adminToken, (input, init) =>
    t.engine.fetch(new Request(input, init)),
  );
});

afterEach(() => {
  delete process.env.PERMISSION_CACHE_TTL_MS;
});

describe('householdMembers', () => {
  test('superusers and Admin/Member role holders, by name; not guests or the role-less', async () => {
    const sam = await seedUser(t.engine, { email: 'sam@example.com', displayName: 'Sam' });
    const jo = await seedUser(t.engine, { email: 'jo@example.com', displayName: 'Jo' });
    const guest = await seedUser(t.engine, { email: 'guest@example.com', displayName: 'Guest' });
    await seedUser(t.engine, { email: 'nobody@example.com', displayName: 'Nobody' });
    await join('members', sam.user.id);
    await join('admins', jo.user.id);
    await join('guests', guest.user.id);

    expect(t.engine.householdMembers()).toEqual([
      // The seeded superuser has no display name: their email's local part.
      { id: t.admin.id, name: 'admin', admin: true },
      { id: jo.user.id, name: 'Jo', admin: true },
      { id: sam.user.id, name: 'Sam', admin: false },
    ]);
  });

  test('any group conferring a household role counts', async () => {
    const res = await call(t.engine, 'POST', '/groups?id=kids', {
      token: t.adminToken,
      body: { name: 'Kids', role: 'roles/member' },
    });
    expect(res.status).toBe(201);
    const kid = await seedUser(t.engine, { email: 'kid@example.com', displayName: 'Kid' });
    await join('kids', kid.user.id);
    expect(t.engine.householdMembers().map((m) => m.name)).toContain('Kid');
  });
});
