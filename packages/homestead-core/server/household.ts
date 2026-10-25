/**
 * Injection seam for the household directory (`../household/types`).
 *
 * The engine knows who holds a household role, and core can't import the
 * engine (the dependency direction is server → core), so the server hands down
 * a lookup at boot — like `setCollectionAccessResolver`. With none installed
 * (unit tests) the household is empty.
 */

import type { HouseholdMember } from '../household/types';

export type HouseholdDirectory = () => HouseholdMember[];

let current: HouseholdDirectory | null = null;

/** Install the server's directory. `null` empties the household. */
export function setHouseholdDirectory(directory: HouseholdDirectory | null): void {
  current = directory;
}

/** Everyone who shares this Homestead, by name. */
export function householdMembers(): HouseholdMember[] {
  return current ? current() : [];
}

/**
 * The household as `userId` may see it: everyone, when they're a member of it;
 * nothing, when they aren't (a guest learns no one's name).
 */
export function householdFor(userId: string): HouseholdMember[] {
  const members = householdMembers();
  return members.some((m) => m.id === userId) ? members : [];
}
