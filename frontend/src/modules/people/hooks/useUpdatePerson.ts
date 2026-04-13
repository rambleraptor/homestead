/**
 * Update Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { PersonFormData, NotificationPreference } from '../types';
import {
  findSharedDataForPerson,
  updateSharedData,
  createSharedData,
  setPartner,
  removePartner,
} from '../utils/sharedDataSync';
import { syncRecurringNotificationsForPerson } from '../utils/notificationSync';

interface UpdatePersonData {
  id: string;
  data: PersonFormData;
}

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences?: NotificationPreference[];
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

      const personRecord = await aepbase.update<PersonRecord>(AepCollections.PEOPLE, id, {
        name: data.name,
        birthday: data.birthday,
      });

      const newPartnerId = data.partner_id;
      const partnerChanged = oldPartnerId !== newPartnerId;

      if (partnerChanged) {
        if (oldPartnerId && !newPartnerId) {
          await removePartner(id, oldPartnerId);
        } else if (!oldPartnerId && newPartnerId) {
          await setPartner(id, newPartnerId, {
            addresses: data.addresses,
            anniversary: data.anniversary,
          });
        } else if (oldPartnerId && newPartnerId && oldPartnerId !== newPartnerId) {
          await removePartner(id, oldPartnerId);
          await setPartner(id, newPartnerId, {
            addresses: data.addresses,
            anniversary: data.anniversary,
          });
        }
      } else if (oldSharedData) {
        await updateSharedData(oldSharedData.id, {
          addresses: data.addresses,
          anniversary: data.anniversary,
        });
      } else if (data.addresses.length > 0 || data.anniversary) {
        await createSharedData({
          personId: id,
          addresses: data.addresses,
          anniversary: data.anniversary,
        });
      }

      try {
        await syncRecurringNotificationsForPerson(
          id,
          data.name,
          data.birthday,
          data.anniversary,
          data.notification_preferences,
        );
      } catch (syncError) {
        logger.error('Failed to sync recurring notifications', syncError, { personId: id });
      }

      return { personRecord, oldPartnerId, newPartnerId };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('people').list() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('people').detail(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('recurring_notifications').list(),
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
