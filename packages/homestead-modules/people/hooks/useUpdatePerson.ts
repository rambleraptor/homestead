/**
 * Update Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { PersonFormData } from '../types';
import {
  findSharedDataForPerson,
  updateSharedData,
  createSharedData,
  setPartner,
  removePartner,
} from '../utils/sharedDataSync';

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
      const oldSharedData = await findSharedDataForPerson(id);
      const oldPartnerId = oldSharedData
        ? oldSharedData.person_a === id
          ? oldSharedData.person_b
          : oldSharedData.person_a
        : undefined;

      const personRecord = await aepbase.update<PersonRecord>(PEOPLE, id, {
        name: data.name,
      });

      const newPartnerId = data.partner_id || undefined;
      const partnerChanged = (oldPartnerId || undefined) !== newPartnerId;

      if (partnerChanged) {
        if (oldPartnerId && !newPartnerId) {
          await removePartner(id, oldPartnerId);
        } else if (!oldPartnerId && newPartnerId) {
          await setPartner(id, newPartnerId, {
            addresses: data.addresses,
          });
        } else if (oldPartnerId && newPartnerId && oldPartnerId !== newPartnerId) {
          await removePartner(id, oldPartnerId);
          await setPartner(id, newPartnerId, {
            addresses: data.addresses,
          });
        }
      } else if (oldSharedData) {
        await updateSharedData(oldSharedData.id, {
          addresses: data.addresses,
        });
      } else if (data.addresses.length > 0) {
        await createSharedData({
          personId: id,
          addresses: data.addresses,
        });
      }

      return { personRecord, oldPartnerId, newPartnerId };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('people').list() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('people').detail(variables.id),
      });
      if (result.newPartnerId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.module('people').detail(result.newPartnerId),
        });
      }
      if (result.oldPartnerId && result.oldPartnerId !== result.newPartnerId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.module('people').detail(result.oldPartnerId),
        });
      }
    },
    onError: (error) => logger.error('Person update mutation error', error),
  });
}
