import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Person, NotificationPreference, Address } from '../types';
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

      // Fetch address if shared data has address_id
      let address: Address | undefined;
      if (sharedData?.address_id) {
        try {
          address = await getCollection<Address>(Collections.ADDRESSES).getOne(sharedData.address_id);
        } catch {
          // Address not found, continue without it
        }
      }

      // Find partner if shared data exists
      let partner: Person | undefined;
      if (sharedData) {
        const partnerId = sharedData.person_a === id ? sharedData.person_b : sharedData.person_a;
        if (partnerId) {
          const partnerRecord = await getCollection<PersonRecord>(Collections.PEOPLE).getOne(partnerId);
          partner = {
            ...partnerRecord,
            address,
            anniversary: sharedData.anniversary,
            partner: undefined,
          };
        }
      }

      const person: Person = {
        ...record,
        address,
        anniversary: sharedData?.anniversary,
        partner,
      };

      return person;
    },
    enabled: !!id,
  });
}
