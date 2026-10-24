/**
 * Permissions data model (design: docs/design/permissions.md §6).
 *
 * Four platform-level AEP resources back the permissions system:
 *   - `role`             — a named capability bundle (grants it confers)
 *   - `group`            — a named set of users
 *   - `group-membership` — a user's membership in a group (+ optional role)
 *   - `access-grant`     — one ACL entry (subject × capability × target × effect)
 *
 * All four are `superuser_write` for now: only superusers (and the boot-time
 * seeder) may mutate them. Phase 3 replaces the flat `superuser_write` on
 * `access-grant` with the manage-on-target rule (§15.3); until enforcement is
 * turned on, superuser-only writes are the safe default.
 *
 * These are aggregated into the boot-time schema sync alongside
 * `BUILTIN_RESOURCE_DEFS` (see homestead-server/src/schema-sync.ts).
 */

import type { ResourceDefinition } from '../resources/types';

export const ROLES = 'roles' as const;
export const GROUPS = 'groups' as const;
export const GROUP_MEMBERSHIPS = 'group-memberships' as const;
export const ACCESS_GRANTS = 'access-grants' as const;

/** Capability ladder + scope/effect enums, shared with the resolver. */
const CAPABILITY_VALUES = ['read', 'write', 'manage'] as const;
const SCOPE_VALUES = ['all', 'app', 'collection', 'record'] as const;
const EFFECT_VALUES = ['allow', 'deny'] as const;
// 'token' addresses a personal access token (subject_id = the PAT record id).
// Only the token-mint flow may write these; the public grants API rejects them
// (see enforceGrantWrite) so a PAT can never be granted more than its owner has.
const SUBJECT_VALUES = ['user', 'group', 'everyone', 'token'] as const;

export const PERMISSION_RESOURCE_DEFS: ResourceDefinition[] = [
  {
    singular: 'role',
    plural: ROLES,
    description:
      'A named capability bundle. Assigned to people via a group membership; ' +
      'holding a role confers its grants. Superuser-managed.',
    superuser_write: true,
    fields: {
      name: { type: 'string', required: true },
      description: { type: 'string' },
      grants: {
        type: 'array',
        description: 'Collection/app/all-scope grants this role confers (allow or deny).',
        items: {
          type: 'object',
          properties: {
            target_scope: { type: 'string', enum: ['all', 'app', 'collection'] },
            target_app: { type: 'string' },
            resource_type: { type: 'string' },
            filter: { type: 'string' },
            capability: { type: 'string', enum: [...CAPABILITY_VALUES] },
            effect: { type: 'string', enum: [...EFFECT_VALUES] }, // default 'allow'
          },
        },
      },
    },
  },
  {
    singular: 'group',
    plural: GROUPS,
    description: 'A named set of users. Grants may be addressed to a group.',
    superuser_write: true,
    fields: {
      name: { type: 'string', required: true },
      description: { type: 'string' },
      // The role conferred on *every* member of this group. Group-level (not
      // per-member) by design: everyone in a group has the same access, so a
      // person's access is simply the union of their groups' roles (§11 #8).
      role: {
        type: 'string',
        reference: { resource: 'role' },
        description: 'Role conferred on every member of this group.',
      },
    },
  },
  {
    singular: 'group-membership',
    plural: GROUP_MEMBERSHIPS,
    description:
      "A user's membership in a group. Every member receives the group's role.",
    parents: ['group'],
    superuser_write: true,
    // The permission model governs itself (manage-on-target, §15.3); a
    // membership's access must not follow its group's.
    independent_access: true,
    fields: {
      user: { type: 'string', reference: { resource: 'user' }, required: true },
    },
  },
  {
    singular: 'access-grant',
    plural: ACCESS_GRANTS,
    description:
      'One ACL entry: a subject gets a capability over a target, allow or deny. ' +
      'target_scope selects which of target_app / resource_type / resource_id / ' +
      'filter apply.',
    superuser_write: true,
    fields: {
      subject_type: { type: 'string', enum: [...SUBJECT_VALUES], required: true },
      subject_id: { type: 'string' }, // omitted for 'everyone'
      target_scope: { type: 'string', enum: [...SCOPE_VALUES], required: true },
      target_app: { type: 'string' }, // when target_scope = 'app'
      resource_type: { type: 'string' }, // when target_scope = 'collection' | 'record'
      resource_id: { type: 'string' }, // when target_scope = 'record'
      filter: { type: 'string' }, // when target_scope = 'collection'
      capability: { type: 'string', enum: [...CAPABILITY_VALUES], required: true },
      effect: { type: 'string', enum: [...EFFECT_VALUES] }, // default 'allow'
    },
  },
];
