/**
 * Client-side writes for `household` records. The membership rules live in
 * `./households`; this applies them through aepbase.
 */

import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { HOUSEHOLDS } from '../resources';
import type { Household, HouseholdFormData } from '../types';
import { planMemberships } from './households';

export async function listHouseholds(): Promise<Household[]> {
  const rows = await aepbase.list<Household>(HOUSEHOLDS);
  return rows.map((h) => ({ ...h, members: h.members ?? [] }));
}

export function householdBody(data: HouseholdFormData) {
  return {
    name: data.name.trim(),
    members: data.members,
    line1: data.line1,
    line2: data.line2,
    city: data.city,
    state: data.state,
    postal_code: data.postal_code,
    country: data.country,
    wifi_network: data.wifi_network,
    wifi_password: data.wifi_password,
  };
}

export async function createHousehold(data: HouseholdFormData): Promise<Household> {
  const userId = aepbase.getCurrentUser()?.id;
  return aepbase.create<Household>(HOUSEHOLDS, {
    ...householdBody(data),
    created_by: userId ? `users/${userId}` : undefined,
  });
}

/** Make `personId` a member of exactly `householdIds`. */
export async function syncPersonHouseholds(
  personId: string,
  householdIds: string[],
): Promise<void> {
  const households = await listHouseholds();
  for (const update of planMemberships(personId, households, householdIds)) {
    await aepbase.update<Household>(HOUSEHOLDS, update.id, { members: update.members });
  }
}
