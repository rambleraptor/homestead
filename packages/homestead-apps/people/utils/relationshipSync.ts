/**
 * Client-side writes for `person-relationship` rows. The rules live in
 * `./relationships`; this applies a plan through aepbase.
 */

import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PERSON_RELATIONSHIPS } from '../resources';
import type { PersonRelationship } from '../types';
import { planRelationships, type DesiredRelatives } from './relationships';

export function listRelationships(): Promise<PersonRelationship[]> {
  return aepbase.list<PersonRelationship>(PERSON_RELATIONSHIPS);
}

/** Make `personId`'s stored relationship rows match `desired`. */
export async function syncRelationships(
  personId: string,
  desired: DesiredRelatives,
): Promise<void> {
  const rows = await listRelationships();
  const plan = planRelationships(personId, rows, desired);
  const userId = aepbase.getCurrentUser()?.id;

  for (const id of plan.remove) {
    await aepbase.remove(PERSON_RELATIONSHIPS, id);
  }
  for (const link of plan.create) {
    await aepbase.create<PersonRelationship>(PERSON_RELATIONSHIPS, {
      ...link,
      created_by: userId ? `users/${userId}` : undefined,
    });
  }
}
