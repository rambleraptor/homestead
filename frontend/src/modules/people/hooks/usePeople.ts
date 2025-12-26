import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Person, NotificationPreference } from '../types';
import { findSharedDataForPerson } from '../utils/sharedDataSync';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created: string;
  updated: string;
}

export function usePeople() {
  return useQuery({
    queryKey: queryKeys.module('people').list(),
    queryFn: async () => {
      // Fetch all people records
      const peopleRecords = await getCollection<PersonRecord>(Collections.PEOPLE).getFullList({
        sort: 'name',
      });

      // Enrich with shared data
      const people: Person[] = await Promise.all(
        peopleRecords.map(async (record) => {
          const sharedData = await findSharedDataForPerson(record.id);

          // Find partner if shared data exists
          let partner: Person | undefined;
          const partnerId = sharedData
            ? (sharedData.person_a === record.id ? sharedData.person_b : sharedData.person_a)
            : undefined;

          if (partnerId) {
            const partnerRecord = peopleRecords.find(p => p.id === partnerId);
            if (partnerRecord) {
              partner = {
                ...partnerRecord,
                address: sharedData?.address,
                anniversary: sharedData?.anniversary,
                partner: undefined, // Avoid circular reference
              };
            }
          }

          return {
            ...record,
            address: sharedData?.address,
            anniversary: sharedData?.anniversary,
            partner,
          };
        })
      );

      return people;
    },
  });
}
