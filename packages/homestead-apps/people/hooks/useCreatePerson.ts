/**
 * Create Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { PersonFormData } from '../types';
import { createSharedData, setPartner } from '../utils/sharedDataSync';

interface PersonRecord {
  id: string;
  name: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
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

      if (data.partner_id) {
        await setPartner(personRecord.id, data.partner_id, {
          addresses: data.addresses,
        });
      } else if (data.addresses.length > 0) {
        await createSharedData({
          personId: personRecord.id,
          addresses: data.addresses,
        });
      }

      return personRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.app('people').list() });
    },
  });
}
