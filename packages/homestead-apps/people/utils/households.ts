/**
 * Pure helpers for `household` records: who belongs to which household, how a
 * person's memberships change when they're edited, and display formatting.
 *
 * No client imports, so the server-side bulk import and migration use the
 * same rules as the SPA.
 */

import type { Household } from '../types';
import { personIdOf } from './relationships';

/** A household's members as bare person ids. */
export function memberIds(household: Pick<Household, 'members'>): string[] {
  return (household.members ?? []).map(personIdOf);
}

/** The households `personId` belongs to, by name. */
export function householdsFor<H extends Household>(personId: string, households: H[]): H[] {
  return households
    .filter((h) => memberIds(h).includes(personId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface MembershipUpdate {
  id: string;
  members: string[];
}

/**
 * The `members` rewrites that make `personId` belong to exactly
 * `householdIds`. Households whose membership doesn't change are left out.
 */
export function planMemberships(
  personId: string,
  households: Household[],
  householdIds: string[],
): MembershipUpdate[] {
  const wanted = new Set(householdIds);
  const updates: MembershipUpdate[] = [];
  for (const household of households) {
    const members = memberIds(household);
    const isMember = members.includes(personId);
    if (wanted.has(household.id) && !isMember) {
      updates.push({ id: household.id, members: [...members, personId] });
    } else if (!wanted.has(household.id) && isMember) {
      updates.push({ id: household.id, members: members.filter((m) => m !== personId) });
    }
  }
  return updates;
}

/** "Ann", "Ann & Bob", "Ann, Bob & Cat". */
export function householdNameFor(names: string[]): string {
  const present = names.filter(Boolean);
  if (present.length <= 1) return present[0] ?? 'Household';
  return `${present.slice(0, -1).join(', ')} & ${present[present.length - 1]}`;
}

type AddressParts = Pick<
  Household,
  'line1' | 'line2' | 'city' | 'state' | 'postal_code' | 'country'
>;

export function formatAddress(household: AddressParts): string {
  return [
    household.line1,
    household.line2,
    household.city,
    household.state,
    household.postal_code,
    household.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}
