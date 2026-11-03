/**
 * The permission resource definitions must be valid authoring defs that
 * translate to wire schema and whose references resolve — otherwise the
 * boot-time schema sync fails fast.
 */

import { describe, expect, it } from 'vitest';
import { PERMISSION_RESOURCE_DEFS } from '../resources';
import { OPEN_GRANT_ID, buildSeedRoles } from '../seed';
import { householdApps, householdCollections, OWN_ROWS_FILTER } from '../household';
import { BUILTIN_RESOURCE_DEFS } from '../../resources/builtins';
import {
  toWireSchema,
  validateReferenceTargets,
  validateResourceDefinition,
} from '../../resources/translate';

describe('permission resource definitions', () => {
  it('each def passes authoring validation and translates to wire schema', () => {
    for (const def of PERMISSION_RESOURCE_DEFS) {
      expect(() => validateResourceDefinition(def)).not.toThrow();
      expect(() => toWireSchema(def.fields, def.singular)).not.toThrow();
    }
  });

  it('references resolve across the full definition set', () => {
    expect(() =>
      validateReferenceTargets([...BUILTIN_RESOURCE_DEFS, ...PERMISSION_RESOURCE_DEFS]),
    ).not.toThrow();
  });

  it('declares exactly the four expected resources', () => {
    expect(PERMISSION_RESOURCE_DEFS.map((d) => d.singular).sort()).toEqual([
      'access-grant',
      'group',
      'group-membership',
      'role',
    ]);
  });

  it('all four are superuser_write for now', () => {
    for (const def of PERMISSION_RESOURCE_DEFS) {
      expect(def.superuser_write).toBe(true);
    }
  });

  it('group-membership is parented under group', () => {
    const membership = PERMISSION_RESOURCE_DEFS.find((d) => d.singular === 'group-membership');
    expect(membership?.parents).toEqual(['group']);
  });
});

describe('permission seed data', () => {
  it('builds admin/member/guest with the expected capability bundles', () => {
    // The three built-in access levels are unchanged; what changed is how they
    // are written — one collection-scope grant per covered collection instead of
    // a single `all`-scope blanket. A Member still reads and writes every
    // household collection.
    const roles = buildSeedRoles([
      { resource_type: 'todo' },
      { resource_type: 'document', filter: OWN_ROWS_FILTER },
    ]);
    const byId = Object.fromEntries(roles.map((r) => [r.id, r]));

    expect(byId.admin.grants).toEqual([
      { target_scope: 'collection', resource_type: 'todo', capability: 'manage' },
      { target_scope: 'collection', resource_type: 'document', capability: 'manage', filter: OWN_ROWS_FILTER },
    ]);
    expect(byId.member.grants).toEqual([
      { target_scope: 'collection', resource_type: 'todo', capability: 'write' },
      { target_scope: 'collection', resource_type: 'document', capability: 'write', filter: OWN_ROWS_FILTER },
    ]);
    expect(byId.guest.grants).toEqual([]); // empty until something is shared

    // No grant anywhere is `all`-scope — that shape is what we removed.
    for (const role of roles) {
      expect(role.grants.every((g) => g.target_scope === 'collection')).toBe(true);
    }
  });

  it('household roles grant collection-less apps, but not the always-visible ones', () => {
    const apps = householdApps([
      { id: 'chat', name: 'Chat' },
      { id: 'settings', name: 'Settings' },
      { id: 'apps', name: 'All apps' },
      { id: 'recipes', name: 'Recipes', resources: [{ singular: 'recipe', plural: 'recipes', fields: {} }] },
    ] as never);
    // Chat has nothing to gate on, so a role must grant it explicitly.
    expect(apps).toContain('chat');
    // Settings and the app drawer are visible without a grant, so granting
    // them would be noise.
    expect(apps).not.toContain('settings');
    expect(apps).not.toContain('apps');
    // Recipes is gated by its own collection.
    expect(apps).not.toContain('recipes');
  });

  it('household roles cover every declared collection except the self-governing ones', () => {
    const covered = householdCollections([
      { singular: 'todo', plural: 'todos', fields: {} },
      // Privacy comes from the resource's own declaration now — core names no
      // app collection, so an undeclared resource is shared.
      { singular: 'document', plural: 'documents', fields: {}, access: { model: 'private' } },
      // user-parented: the server governs these by path, but the client mirror
      // has no such rule — leave them out and an app whose resources are all
      // user-parented (Notifications) drops out of the sidebar entirely.
      { singular: 'notification', plural: 'notifications', parents: ['user'], fields: {} },
      // self-governing: the manage-on-target rule owns these
      { singular: 'access-grant', plural: 'access-grants', fields: {} },
    ]);
    const names = covered.map((c) => c.resource_type);

    expect(names).toContain('todo');
    expect(names).toContain('document');
    expect(names).toContain('notification');
    expect(names).not.toContain('access-grant');
    // Covered only for a member's own rows, because the def says so.
    expect(covered.find((c) => c.resource_type === 'document')?.filter).toBe(OWN_ROWS_FILTER);
    expect(covered.find((c) => c.resource_type === 'todo')?.filter).toBeUndefined();
  });

  it('seeds no grants — a household starts closed', () => {
    // The open-household grant (`everyone → write on *`) is gone: access comes
    // from the role a group confers, never from a seeded blanket allow. Only the
    // retired grant's id survives, for the migration that deletes it.
    expect(OPEN_GRANT_ID).toBe('open-household');
  });
});
