/**
 * React-query hooks for the permissions data model (design §15) — the data
 * layer under any admin/sharing UI. Roles, groups, and access-grants are
 * ordinary AEP resources, so these are thin wrappers over the aepbase client;
 * the server enforces the manage-on-target write rule (§15.3), so a failed
 * mutation surfaces as an error, not a silent no-op.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '../api/aepbase';
import { fetchHousehold } from '../household/useHousehold';
import { fetchPermissionContextFor } from './client';
import { ACCESS_GRANTS, GROUP_MEMBERSHIPS, GROUPS, ROLES } from './resources';
import type { Capability, Effect } from './resolve';

// ─────────────────────────── Record shapes ───────────────────────────

export interface RoleGrantRow {
  target_scope?: string;
  target_app?: string;
  resource_type?: string;
  filter?: string;
  capability?: Capability;
  /** 'allow' (default) confers access; 'deny' blocks it (deny always wins). */
  effect?: Effect;
}
export interface RoleRecord {
  id: string;
  name: string;
  description?: string;
  grants?: RoleGrantRow[];
}
export interface GroupRecord {
  id: string;
  name: string;
  description?: string;
  /** Role conferred on every member of this group (id reference). */
  role?: string;
}
export interface GroupMembershipRecord {
  id: string;
  user: string;
}
export interface AccessGrantRecord {
  id: string;
  subject_type: 'user' | 'group' | 'everyone';
  subject_id?: string;
  target_scope: 'all' | 'app' | 'collection' | 'record';
  target_app?: string;
  resource_type?: string;
  resource_id?: string;
  filter?: string;
  capability: Capability;
  effect?: 'allow' | 'deny';
}

const keys = {
  roles: ['permissions', 'roles'] as const,
  groups: ['permissions', 'groups'] as const,
  members: (groupId: string) => ['permissions', 'groups', groupId, 'members'] as const,
  grants: (filter: string) => ['permissions', 'access-grants', filter] as const,
  grantsAll: ['permissions', 'access-grants'] as const,
};

// ─────────────────────────── Queries ───────────────────────────

export function useRoles() {
  return useQuery({ queryKey: keys.roles, queryFn: () => aepbase.list<RoleRecord>(ROLES) });
}

export interface RoleInput {
  name: string;
  description?: string;
  grants: RoleGrantRow[];
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoleInput) =>
      aepbase.create<RoleRecord>(ROLES, {
        name: input.name,
        description: input.description,
        grants: input.grants,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roles }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: RoleInput & { id: string }) =>
      aepbase.update<RoleRecord>(ROLES, id, {
        name: input.name,
        description: input.description ?? '',
        grants: input.grants,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roles }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => aepbase.remove(ROLES, roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roles }),
  });
}

export function useGroups() {
  return useQuery({ queryKey: keys.groups, queryFn: () => aepbase.list<GroupRecord>(GROUPS) });
}

export function useGroupMemberships(groupId: string) {
  return useQuery({
    queryKey: keys.members(groupId),
    queryFn: () => aepbase.list<GroupMembershipRecord>(GROUP_MEMBERSHIPS, { parent: [GROUPS, groupId] }),
    enabled: !!groupId,
  });
}

/**
 * Another user's resolved permission context (superuser only). Feeds the Users
 * page access summary; the current user's own context comes from AuthContext.
 */
export function useUserPermissionContext(userId: string | undefined) {
  return useQuery({
    queryKey: ['permissions', 'user-context', userId] as const,
    queryFn: () => fetchPermissionContextFor(userId!, aepbase.authStore.token),
    enabled: !!userId,
  });
}

/** Grants, optionally scoped to a single record ("who can see this?"). */
export function useAccessGrants(target?: { resourceType?: string; recordId?: string }) {
  const clauses: string[] = [];
  if (target?.resourceType) clauses.push(`resource_type == '${target.resourceType}'`);
  if (target?.recordId) clauses.push(`resource_id == '${target.recordId}'`);
  const filter = clauses.join(' && ');
  return useQuery({
    queryKey: filter ? keys.grants(filter) : keys.grantsAll,
    queryFn: () => aepbase.list<AccessGrantRecord>(ACCESS_GRANTS, filter ? { filter } : {}),
  });
}

// ─────────────────────────── Mutations ───────────────────────────

export interface ShareRecordInput {
  resourceType: string;
  recordId: string;
  subject: { type: 'user' | 'group'; id: string };
  capability?: Capability; // default 'read'
  /**
   * 'allow' (default) grants access; 'deny' blocks the subject on this record
   * even against a broader allow (deny always wins — see resolve()). A block is
   * written at `manage` so it beats an allow at any capability.
   */
  effect?: Effect;
}

/** Share a single record with a user or group (record-scope grant). */
export function useShareRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ShareRecordInput) =>
      aepbase.create<AccessGrantRecord>(ACCESS_GRANTS, {
        subject_type: input.subject.type,
        subject_id: input.subject.id,
        target_scope: 'record',
        resource_type: input.resourceType,
        resource_id: input.recordId,
        capability: input.capability ?? (input.effect === 'deny' ? 'manage' : 'read'),
        // Only stamp effect for a deny: the wire schema defaults to allow, so an
        // allow share stays byte-identical to the pre-deny payload.
        ...(input.effect === 'deny' ? { effect: 'deny' as const } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.grantsAll }),
  });
}

/** Revoke any grant by id (un-share / un-block). */
export function useRevokeGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => aepbase.remove(ACCESS_GRANTS, grantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.grantsAll }),
  });
}

export interface GroupInput {
  name: string;
  description?: string;
  /** Conferred role id, or '' / undefined for no role. */
  role?: string;
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GroupInput) =>
      aepbase.create<GroupRecord>(GROUPS, {
        name: data.name,
        description: data.description,
        role: data.role || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.groups }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: GroupInput & { id: string }) =>
      aepbase.update<GroupRecord>(GROUPS, id, {
        name: data.name,
        description: data.description ?? '',
        // Send '' (not undefined) to clear the conferred role via merge-patch.
        role: data.role ?? '',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.groups }),
  });
}

export interface AddGroupMemberInput {
  groupId: string;
  userId: string;
}

export function useAddGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddGroupMemberInput) =>
      aepbase.create<GroupMembershipRecord>(
        GROUP_MEMBERSHIPS,
        { user: input.userId },
        { parent: [GROUPS, input.groupId] },
      ),
    onSuccess: (_data, input) => qc.invalidateQueries({ queryKey: keys.members(input.groupId) }),
  });
}

export interface RemoveGroupMemberInput {
  groupId: string;
  membershipId: string;
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RemoveGroupMemberInput) =>
      aepbase.remove(GROUP_MEMBERSHIPS, input.membershipId, { parent: [GROUPS, input.groupId] }),
    onSuccess: (_data, input) => qc.invalidateQueries({ queryKey: keys.members(input.groupId) }),
  });
}

/**
 * Delete a group, first removing its memberships so the parent delete can't be
 * blocked by lingering children. Idempotent enough for a UI action: a missing
 * child just no-ops.
 */
export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const members = await aepbase.list<GroupMembershipRecord>(GROUP_MEMBERSHIPS, {
        parent: [GROUPS, groupId],
      });
      for (const m of members) {
        await aepbase.remove(GROUP_MEMBERSHIPS, m.id, { parent: [GROUPS, groupId] });
      }
      await aepbase.remove(GROUPS, groupId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.groups }),
  });
}

// ─────────────────────────── Users (for the member picker) ───────────────────────────

export interface UserLite {
  id: string;
  display_name?: string;
  email?: string;
}

/** All users, for resolving membership ids to names and populating the picker. */
export function useAllUsers() {
  return useQuery({
    queryKey: ['permissions', 'users'] as const,
    queryFn: () => aepbase.list<UserLite>('users'),
  });
}

/**
 * The people a record can be shared with. A superuser lists every account; for
 * anyone else that list is refused (403), so they get the household directory
 * instead — the people they share this Homestead with.
 */
export function useShareableUsers() {
  return useQuery({
    queryKey: ['permissions', 'shareable-users'] as const,
    queryFn: async (): Promise<UserLite[]> => {
      try {
        return await aepbase.list<UserLite>('users');
      } catch (err) {
        if (!(err instanceof AepbaseError) || err.code !== 403) throw err;
        const members = await fetchHousehold();
        return members.map((m) => ({ id: m.id, display_name: m.name }));
      }
    },
  });
}

/** `users/u1` (or a bare id) → `u1`, matching how references are stored. */
export function bareId(value: string): string {
  const slash = value.lastIndexOf('/');
  return slash === -1 ? value : value.slice(slash + 1);
}

/** A short human summary of a role's conferred grants, for the read-only list. */
export function summarizeRoleGrants(grants: RoleGrantRow[] | undefined): string {
  if (!grants || grants.length === 0) return 'No access';
  return grants
    .map((g) => {
      const cap = g.capability ?? 'read';
      // A deny reads as "no <cap>" so the summary stays scannable ("no read on …").
      const verb = g.effect === 'deny' ? `no ${cap}` : cap;
      if (g.target_scope === 'all') return `${verb} on everything`;
      if (g.target_scope === 'app') return `${verb} on the ${g.target_app} app`;
      if (g.target_scope === 'collection') return `${verb} on ${g.resource_type}`;
      return `${verb} (${g.target_scope})`;
    })
    .join(', ');
}
