import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { PersonFormData, NotificationPreference } from '../types';
import { createSharedData } from '../utils/sharedDataSync';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created: string;
  updated: string;
}

export function useBulkImportPeople() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();

  return useMutation({
    mutationFn: async (people: PersonFormData[]) => {
      // Create people one by one to properly handle shared data
      const createdPeople = [];

      for (const personData of people) {
        // Create person record (without address/anniversary - those go in shared_data)
        const personRecord = await getCollection<PersonRecord>(Collections.PEOPLE).create({
          name: personData.name,
          birthday: personData.birthday,
          notification_preferences: personData.notification_preferences,
          created_by: currentUser?.id,
        });

        // Create shared data if address or anniversary provided
        // Note: Bulk import doesn't support partner_id relationships
        if (personData.address || personData.anniversary) {
          await createSharedData({
            personId: personRecord.id,
            address: personData.address,
            anniversary: personData.anniversary,
          });
        }

        createdPeople.push(personRecord);
      }

      return createdPeople;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('people').list(),
      });
    },
  });
}