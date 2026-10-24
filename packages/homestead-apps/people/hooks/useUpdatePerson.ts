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

interface UpdatePersonData {
  id: string;
  data: PersonFormData;
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
    mutationFn: async ({ id, data }: UpdatePersonData) => {
      const personRecord = await aepbase.update<PersonRecord>(PEOPLE, id, {
        name: data.name,
        aliases: data.aliases,
      });

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
