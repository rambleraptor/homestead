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

      // Fetch addresses from both sources (primary + additional)
      const addresses: Address[] = [];

      if (sharedData) {
        // 1. Get primary address from address_id
        if (sharedData.address_id) {
          try {
            const primaryAddress = await getCollection<Address>(Collections.ADDRESSES).getOne(sharedData.address_id);
            addresses.push(primaryAddress);
          } catch {
            // Primary address not found, continue without it
          }
        }

        // 2. Get additional addresses where shared_data_id matches
        try {
          const additionalAddresses = await getCollection<Address>(Collections.ADDRESSES).getFullList({
            filter: `shared_data_id = "${sharedData.id}"`,
          });

          // Avoid duplicates (exclude primary address)
          for (const address of additionalAddresses) {
            if (address.id !== sharedData.address_id) {
              addresses.push(address);
            }
          }
        } catch {
          // No additional addresses found
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
            addresses, // Partners share addresses
            anniversary: sharedData.anniversary,
            partner: undefined,
          };
        }
      }

      const person: Person = {
        ...record,
        addresses,
        anniversary: sharedData?.anniversary,
        partner,
      };

      return person;
    },
    enabled: !!id,
  });
}
