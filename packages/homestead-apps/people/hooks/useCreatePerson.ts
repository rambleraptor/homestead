/**
 * Create Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { PersonFormData } from '../types';
import { syncRelationships } from '../utils/relationshipSync';
import { createHousehold, syncPersonHouseholds } from '../utils/householdSync';
import { setAccountLink } from '../utils/accountSync';

interface PersonRecord {
  id: string;
  name: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

export function relativesFromForm(data: PersonFormData) {
  return {
    partnerId: data.partner_id || undefined,
    parentIds: data.parent_ids ?? [],
    childIds: data.child_ids ?? [],
    siblingIds: data.sibling_ids ?? [],
  };
}

/**
 * Join the households picked in the form, plus a new one when the form's
 * "New household" shortcut was filled in.
 */
export async function applyHouseholds(personId: string, data: PersonFormData) {
  const householdIds = [...(data.household_ids ?? [])];
  if (data.new_household?.name.trim()) {
    const created = await createHousehold({ ...data.new_household, members: [personId] });
    householdIds.push(created.id);
  }
  await syncPersonHouseholds(personId, householdIds);
}

export function useCreatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PersonFormData) => {
      const userId = aepbase.getCurrentUser()?.id;
      const personRecord = await aepbase.create<PersonRecord>(PEOPLE, {
        name: data.name,
        aliases: data.aliases,
        created_by: userId ? `users/${userId}` : undefined,
      });

      if (data.user_id) await setAccountLink(personRecord.id, data.user_id);
      await applyHouseholds(personRecord.id, data);
      await syncRelationships(personRecord.id, relativesFromForm(data));

      return personRecord;
    },
    onSuccess: () => {
      // Relatives show on the other side too, so every person's view is stale.
      queryClient.invalidateQueries({ queryKey: queryKeys.app('people').all() });
    },
  });
}
