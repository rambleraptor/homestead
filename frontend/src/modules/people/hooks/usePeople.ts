import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Person, NotificationPreference, PersonSharedData, Address } from '../types';

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

      // Fetch ALL shared data in a single query (fixes N+1 problem)
      const allSharedData = await getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA).getFullList();

      // Fetch ALL addresses in a single query
      const allAddresses = await getCollection<Address>(Collections.ADDRESSES).getFullList();

      // Create lookup maps for O(1) access
      const sharedDataByPersonA = new Map<string, PersonSharedData>();
      const sharedDataByPersonB = new Map<string, PersonSharedData>();
      const addressesById = new Map<string, Address>();

      for (const sharedData of allSharedData) {
        sharedDataByPersonA.set(sharedData.person_a, sharedData);
        if (sharedData.person_b) {
          sharedDataByPersonB.set(sharedData.person_b, sharedData);
        }
      }

      for (const address of allAddresses) {
        addressesById.set(address.id, address);
      }

      // Enrich with shared data (no async calls needed)
      const people: Person[] = peopleRecords.map((record) => {
        const sharedData = sharedDataByPersonA.get(record.id) || sharedDataByPersonB.get(record.id);

        // Get addresses from both sources (primary + additional)
        const addresses: Address[] = [];

        if (sharedData) {
          // 1. Get primary address from address_id
          if (sharedData.address_id) {
            const primaryAddress = addressesById.get(sharedData.address_id);
            if (primaryAddress) {
              addresses.push(primaryAddress);
            }
          }

          // 2. Get additional addresses where shared_data_id matches
          for (const address of allAddresses) {
            if (address.shared_data_id === sharedData.id && address.id !== sharedData.address_id) {
              addresses.push(address);
            }
          }
        }

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
              addresses, // Partners share addresses
              anniversary: sharedData?.anniversary,
              partner: undefined, // Avoid circular reference
            };
          }
        }

        return {
          ...record,
          addresses,
          anniversary: sharedData?.anniversary,
          partner,
        };
      });

      return people;
    },
  });
}
