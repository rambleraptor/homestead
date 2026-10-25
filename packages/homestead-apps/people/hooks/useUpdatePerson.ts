/**
 * Update Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { PersonFormData } from '../types';
import { syncRelationships } from '../utils/relationshipSync';
import { applyHouseholds, relativesFromForm } from './useCreatePerson';
import { setAccountLink } from '../utils/accountSync';

interface UpdatePersonData {
  id: string;
  data: PersonFormData;
  /** The account linked before the edit, so an unchanged link isn't rewritten. */
  previousUserId?: string;
}

interface PersonRecord {
  id: string;
  name: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, previousUserId }: UpdatePersonData) => {
      const personRecord = await aepbase.update<PersonRecord>(PEOPLE, id, {
        name: data.name,
        aliases: data.aliases,
      });

      if (data.user_id !== undefined && (data.user_id || undefined) !== previousUserId) {
        await setAccountLink(id, data.user_id);
      }
      await applyHouseholds(id, data);
      await syncRelationships(id, relativesFromForm(data));

      return personRecord;
    },
    onSuccess: () => {
      // Households and relatives show on other people too, so every person's
      // view is stale.
      queryClient.invalidateQueries({ queryKey: queryKeys.app('people').all() });
    },
  });
}
