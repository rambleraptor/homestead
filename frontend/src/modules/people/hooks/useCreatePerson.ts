/**
 * Create Person Mutation Hook — branches on the `people` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { PersonFormData, NotificationPreference } from '../types';
import { createSharedData, setPartner } from '../utils/sharedDataSync';
import { syncRecurringNotificationsForPerson } from '../utils/notificationSync';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created?: string;
  updated?: string;
  create_time?: string;
  update_time?: string;
}

export function useCreatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PersonFormData) => {
      try {
        let personRecord: PersonRecord;

        if (isAepbaseEnabled('people')) {
          const aepUserId = aepbase.getCurrentUser()?.id;
          personRecord = await aepbase.create<PersonRecord>(AepCollections.PEOPLE, {
            name: data.name,
            birthday: data.birthday,
            notification_preferences: data.notification_preferences,
            created_by: aepUserId ? `users/${aepUserId}` : undefined,
          });
        } else {
          const currentUser = getCurrentUser();
          personRecord = await getCollection<PersonRecord>(Collections.PEOPLE).create({
            name: data.name,
            birthday: data.birthday,
            notification_preferences: data.notification_preferences,
            created_by: currentUser?.id,
          });
        }

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

        try {
          await syncRecurringNotificationsForPerson(
            personRecord.id,
            personRecord.name,
            data.birthday,
            data.anniversary,
            data.notification_preferences,
          );
        } catch (syncError) {
          logger.error('Failed to sync recurring notifications', syncError, {
            personId: personRecord.id,
          });
        }

        return personRecord;
      } catch (error) {
        logger.error('Failed to create person', error, { personData: data });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('people').list(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module(Collections.RECURRING_NOTIFICATIONS).list(),
      });
    },
    onError: (error) => {
      logger.error('Person creation mutation error', error);
    },
  });
}
