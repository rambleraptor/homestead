/**
 * Loads the permissions data model (grants, groups, memberships, roles) from
 * SQLite behind a short TTL cache, and assembles what the resolver needs for a
 * caller: their principal set and the grants that could apply to them (direct
 * grants + role-bundle-expanded grants).
 *
 * Mirrors `AccessStore` (access.ts): guarded reads so a fresh db (before the
 * first schema sync) yields empty results — the resolver then simply finds no
 * grants. Pure decision logic lives in permissions.ts; this only feeds it.
 */

import type { Database } from './sqlite';
import type {
  Capability,
  Effect,
  Grant,
  Principals,
  Scope,
} from './permissions';

export const DEFAULT_PERMISSION_CACHE_TTL_MS = 5000;

/**
 * Cache TTL, overridable via `PERMISSION_CACHE_TTL_MS` (0 = always reload).
 * Grant/role/group changes take effect within this window; e2e/tests set it low
 * so a just-created grant is honored immediately.
 */
export function permissionCacheTtlMs(): number {
  const raw = process.env.PERMISSION_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return DEFAULT_PERMISSION_CACHE_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PERMISSION_CACHE_TTL_MS;
}

interface GrantRow {
  subject_type: string;
  subject_id: string | null;
  target_scope: string;
  target_app: string | null;
  resource_type: string | null;
  resource_id: string | null;
  filter: string | null;
  capability: string;
  effect: string | null;
}

interface MembershipRow {
  group_id: string;
  user: string;
}

interface RoleRow {
  id: string;
  grants: string | null;
}

/** Strip a `<collection>/` reference prefix to the bare id (e.g. `users/u1` → `u1`). */
function bareId(value: string): string {
  const slash = value.lastIndexOf('/');
  return slash === -1 ? value : value.slice(slash + 1);
}

function toGrant(row: GrantRow): Grant {
  return {
    subject: {
      type: row.subject_type as Grant['subject']['type'],
      id: row.subject_id ?? undefined,
    },
    capability: row.capability as Capability,
    effect: (row.effect as Effect) || 'allow',
    target: {
      scope: row.target_scope as Scope,
      app: row.target_app ?? undefined,
      resource_type: row.resource_type ?? undefined,
      resource_id: row.resource_id ?? undefined,
      filter: row.filter ?? undefined,
    },
  };
}

export class PermissionStore {
  private grants: Grant[] | null = null;
  private memberships: MembershipRow[] | null = null;
  private rolesById: Map<string, Grant[]> | null = null; // role id → expanded grants (targets only)
  private groupNameById: Map<string, string> | null = null; // group id → name
  private groupRoleById: Map<string, string> | null = null; // group id → conferred role id
  private loadedAt = 0;

  constructor(
    private db: Database,
    private ttlMs: number = DEFAULT_PERMISSION_CACHE_TTL_MS,
  ) {}

  /**
   * Whether the permissions system has been *initialized* at all: any
   * access-grant or any role exists. Used as a fail-open safety valve — when
   * enforcement is on but nothing has been seeded yet (the boot window before
   * the baseline seed runs, or a fully-wiped household), the engine must not
   * lock everyone out. The seeded roles (admin/member/guest) mean a household
   * that *deliberately* removes the open-household grant still reads as
   * initialized, so removing that grant locks down rather than failing open.
   */
  hasBaseline(): boolean {
    this.load();
    return (this.grants?.length ?? 0) > 0 || (this.rolesById?.size ?? 0) > 0;
  }

  /** Force the next access to reload (e.g. after a write in tests). */
  clear(): void {
    this.grants = null;
    this.memberships = null;
    this.rolesById = null;
    this.groupNameById = null;
    this.groupRoleById = null;
    this.loadedAt = 0;
  }

  private load(): void {
    if (this.grants !== null && Date.now() - this.loadedAt < this.ttlMs) return;

    this.grants = this.query<GrantRow>(
      'SELECT subject_type, subject_id, target_scope, target_app, resource_type, resource_id, filter, capability, effect FROM access_grants',
    ).map(toGrant);

    this.memberships = this.query<MembershipRow>(
      'SELECT group_id, user FROM group_memberships',
    );

    const roles = new Map<string, Grant[]>();
    for (const r of this.query<RoleRow>('SELECT id, grants FROM roles')) {
      roles.set(r.id, this.expandRoleGrants(r.grants));
    }
    this.rolesById = roles;

    const groupNames = new Map<string, string>();
    const groupRoles = new Map<string, string>();
    for (const g of this.query<{ id: string; name: string | null; role: string | null }>(
      'SELECT id, name, role FROM "groups"',
    )) {
      if (g.name) groupNames.set(g.id, g.name);
      if (g.role) groupRoles.set(g.id, bareId(g.role));
    }
    this.groupNameById = groupNames;
    this.groupRoleById = groupRoles;

    this.loadedAt = Date.now();
  }

  /** A role's stored `grants` JSON → Grants with a placeholder subject. */
  private expandRoleGrants(raw: string | null): Grant[] {
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: Grant[] = [];
    for (const g of parsed as Array<Record<string, unknown>>) {
      const capability = g.capability;
      const scope = g.target_scope;
      if (typeof capability !== 'string' || typeof scope !== 'string') continue;
      out.push({
        subject: { type: 'everyone' }, // subject is re-bound to the caller in gatherFor
        capability: capability as Capability,
        // A role grant is an allow unless it explicitly denies (deny always wins).
        effect: g.effect === 'deny' ? 'deny' : 'allow',
        target: {
          scope: scope as Scope,
          app: typeof g.target_app === 'string' ? g.target_app : undefined,
          resource_type: typeof g.resource_type === 'string' ? g.resource_type : undefined,
          filter: typeof g.filter === 'string' ? g.filter : undefined,
        },
      });
    }
    return out;
  }

  private query<T>(sql: string): T[] {
    try {
      return this.db.query(sql).all() as T[];
    } catch {
      return []; // table not created yet → empty
    }
  }

  /**
   * The caller's principals and every grant that could apply to them: all
   * access-grants (the resolver filters by subject) plus the grants conferred
   * by the roles their group memberships name, re-addressed to the caller.
   */
  gatherFor(userId: string): { principals: Principals; grants: Grant[] } {
    this.load();
    const groupIds = new Set<string>();
    for (const m of this.memberships ?? []) {
      if (bareId(m.user) !== userId) continue;
      groupIds.add(bareId(m.group_id));
    }
    // Roles are conferred by the group, not the membership: a member holds
    // every role of every group they belong to (§9.x — group-conferred roles).
    const roleIds = new Set<string>();
    for (const groupId of groupIds) {
      const roleId = this.groupRoleById?.get(groupId);
      if (roleId) roleIds.add(roleId);
    }

    // Every stored grant is a real grant now: nothing is a suppressible
    // fallback, because nothing is granted household-wide by default. A
    // caller's access is the union of the grants addressed to them and the
    // grants their roles confer.
    const grants: Grant[] = [...(this.grants ?? [])];
    for (const roleId of roleIds) {
      for (const g of this.rolesById?.get(roleId) ?? []) {
        // Re-address the role's grant to this caller so subject matching passes.
        grants.push({ ...g, subject: { type: 'user', id: userId } });
      }
    }

    return { principals: { userId, groupIds }, grants };
  }

  /**
   * The ids of the roles each user holds through their groups, for the users
   * holding any. Feeds the household directory (`./household`).
   */
  roleIdsByUser(): Map<string, Set<string>> {
    this.load();
    const out = new Map<string, Set<string>>();
    for (const m of this.memberships ?? []) {
      const roleId = this.groupRoleById?.get(bareId(m.group_id));
      if (!roleId) continue;
      const userId = bareId(m.user);
      const roles = out.get(userId) ?? new Set<string>();
      roles.add(roleId);
      out.set(userId, roles);
    }
    return out;
  }

  /**
   * The names of the groups a user belongs to. Feeds the client's app-gating
   * mirror (`tagged` visibility, §9.2), which resolves against group names.
   */
  groupNamesFor(userId: string): string[] {
    this.load();
    const names = new Set<string>();
    for (const m of this.memberships ?? []) {
      if (bareId(m.user) !== userId) continue;
      const name = this.groupNameById?.get(bareId(m.group_id));
      if (name) names.add(name);
    }
    return [...names];
  }
}
