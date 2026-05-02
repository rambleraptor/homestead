/**
 * Create Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { PersonFormData } from '../types';
import { createSharedData, setPartner } from '../utils/sharedDataSync';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

export function useCreatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PersonFormData) => {
      try {
        const userId = aepbase.getCurrentUser()?.id;
        const personRecord = await aepbase.create<PersonRecord>(AepCollections.PEOPLE, {
          name: data.name,
          birthday: data.birthday,
          created_by: userId ? `users/${userId}` : undefined,
        });

        if (data.partner_id) {
          await setPartner(personRecord.id, data.partner_id, {
            addresses: data.addresses,
            anniversary: data.anniversary,
          });
        } else if (data.addresses.length > 0 || data.anniversary) {
          await createSharedData({
            personId: personRecord.id,
            addresses: data.addresses,
            anniversary: data.anniversary,
          });
        }

        return personRecord;
      } catch (error) {
        logger.error('Failed to create person', error, { personData: data });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('people').list() });
    },
    onError: (error) => logger.error('Person creation mutation error', error),
  });
}
