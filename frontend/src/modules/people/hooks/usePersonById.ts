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

export function usePersonById(id: string) {
  return useQuery({
    queryKey: queryKeys.module('people').detail(id),
    queryFn: async () => {
      const record = await getCollection<PersonRecord>(Collections.PEOPLE).getOne(id);
      const sharedData = await findSharedDataForPerson(id);

      // Find partner if shared data exists
      let partner: Person | undefined;
      if (sharedData) {
        const partnerId = sharedData.person_a === id ? sharedData.person_b : sharedData.person_a;
        if (partnerId) {
          const partnerRecord = await getCollection<PersonRecord>(Collections.PEOPLE).getOne(partnerId);
          partner = {
            ...partnerRecord,
            address: sharedData.address,
            anniversary: sharedData.anniversary,
            partner: undefined,
          };
        }
      }

      const person: Person = {
        ...record,
        address: sharedData?.address,
        anniversary: sharedData?.anniversary,
        partner,
      };

      return person;
    },
    enabled: !!id,
  });
}
