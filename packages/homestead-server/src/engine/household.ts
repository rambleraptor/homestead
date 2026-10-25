/**
 * The household directory: who shares this Homestead, by name.
 *
 * Listing accounts is superuser-only (`handleUserList`), but every household
 * member may know who else lives here — the assistant needs it to address
 * people by name, and a member sharing a record needs someone to share with. So
 * the engine answers this one question itself, with only names: membership is
 * a household role (`HOUSEHOLD_ROLES`, through any group) or being a superuser.
 */

import {
  HOUSEHOLD_ROLES,
  type HouseholdMember,
} from '@rambleraptor/homestead-core/household/types';
import type { Database } from './sqlite';
import type { PermissionStore } from './permission-store';
import { TYPE_SUPERUSER } from './types';

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  type: string;
}

/** A member's name: their display name, else their email's local part. */
function nameOf(row: UserRow): string {
  const display = row.display_name?.trim();
  if (display) return display;
  const at = row.email.indexOf('@');
  return at > 0 ? row.email.slice(0, at) : row.email;
}

export function householdMembers(db: Database, permissions: PermissionStore): HouseholdMember[] {
  const roles = permissions.roleIdsByUser();
  const rows = db.query('SELECT id, email, display_name, type FROM _users').all() as UserRow[];
  const members: HouseholdMember[] = [];
  for (const row of rows) {
    const held = roles.get(row.id);
    const superuser = row.type === TYPE_SUPERUSER;
    if (!superuser && !HOUSEHOLD_ROLES.some((r) => held?.has(r))) continue;
    members.push({ id: row.id, name: nameOf(row), admin: superuser || held?.has('admin') === true });
  }
  return members.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
