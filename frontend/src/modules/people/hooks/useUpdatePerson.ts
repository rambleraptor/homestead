/**
 * Update Person Mutation Hook.
 */

import { useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepUpdate } from '@/core/api/resourceHooks';
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

interface UpdatePersonResult {
  personRecord: PersonRecord;
  oldPartnerId?: string;
  newPartnerId?: string;
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useAepUpdate<UpdatePersonResult, UpdatePersonData>(
    AepCollections.PEOPLE,
    {
      moduleId: 'people',
      invalidateAlso: [queryKeys.module('recurring_notifications').list()],
      mutationFn: async ({ id, data }) => {
        const oldSharedData = await findSharedDataForPerson(id);
        const oldPartnerId = oldSharedData
          ? oldSharedData.person_a === id
            ? oldSharedData.person_b
            : oldSharedData.person_a
          : undefined;

        const personRecord = await aepbase.update<PersonRecord>(
          AepCollections.PEOPLE,
          id,
          { name: data.name, birthday: data.birthday },
        );

        const newPartnerId = data.partner_id || undefined;
        const partnerChanged = (oldPartnerId || undefined) !== newPartnerId;

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
          logger.error('Failed to sync recurring notifications', syncError, {
            personId: id,
          });
        }

        return { personRecord, oldPartnerId, newPartnerId };
      },
      // Per-person detail keys depend on the partner ids we just touched —
      // invalidate them after the default `module(people).all()` runs.
      onSuccess: (result, vars) => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.module('people').detail(vars.id),
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
    },
  );
}
