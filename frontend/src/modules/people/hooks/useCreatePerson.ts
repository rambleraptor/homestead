/**
 * Create Person Mutation Hook.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import { logger } from '@/core/utils/logger';
import type { PersonFormData, NotificationPreference } from '../types';
import { createSharedData, setPartner } from '../utils/sharedDataSync';
import { syncRecurringNotificationsForPerson } from '../utils/notificationSync';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences?: NotificationPreference[];
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

export function useCreatePerson() {
  return useAepCreate<PersonRecord, PersonFormData>(AepCollections.PEOPLE, {
    moduleId: 'people',
    invalidateAlso: [queryKeys.module('recurring_notifications').list()],
    mutationFn: async (data) => {
      const personRecord = await aepbase.create<PersonRecord>(
        AepCollections.PEOPLE,
        {
          name: data.name,
          birthday: data.birthday,
          created_by: currentUserPath(),
        },
      );

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
    },
  });
}
