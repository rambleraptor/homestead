/**
 * People list hook. Joins people + person_shared_data + addresses
 * client-side since aepbase has no filter/join support.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Person, NotificationPreference, PersonSharedData, Address } from '../types';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences?: NotificationPreference[];
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

export function usePeople() {
  return useQuery({
    queryKey: queryKeys.module('people').list(),
    queryFn: async () => {
      const [peopleRecords, allSharedData, allAddresses] = await Promise.all([
        aepbase.list<PersonRecord>(AepCollections.PEOPLE),
        aepbase.list<PersonSharedData>(AepCollections.PERSON_SHARED_DATA),
        aepbase.list<Address>(AepCollections.ADDRESSES),
      ]);

      peopleRecords.sort((a, b) => a.name.localeCompare(b.name));

      const sharedDataByPersonA = new Map<string, PersonSharedData>();
      const sharedDataByPersonB = new Map<string, PersonSharedData>();
      const addressesById = new Map<string, Address>();

      for (const sharedData of allSharedData) {
        sharedDataByPersonA.set(sharedData.person_a, sharedData);
        if (sharedData.person_b) sharedDataByPersonB.set(sharedData.person_b, sharedData);
      }
      for (const address of allAddresses) addressesById.set(address.id, address);

      const people: Person[] = peopleRecords.map((record) => {
        const sharedData =
          sharedDataByPersonA.get(record.id) || sharedDataByPersonB.get(record.id);
        const addresses: Address[] = [];
        if (sharedData) {
          if (sharedData.address_id) {
            const primary = addressesById.get(sharedData.address_id);
            if (primary) addresses.push(primary);
          }
          for (const address of allAddresses) {
            if (
              address.shared_data_id === sharedData.id &&
              address.id !== sharedData.address_id
            ) {
              addresses.push(address);
            }
          }
        }

        let partner: Person | undefined;
        const partnerId = sharedData
          ? sharedData.person_a === record.id
            ? sharedData.person_b
            : sharedData.person_a
          : undefined;
        if (partnerId) {
          const partnerRecord = peopleRecords.find((p) => p.id === partnerId);
          if (partnerRecord) {
            partner = {
              ...partnerRecord,
              created: partnerRecord.create_time || '',
              updated: partnerRecord.update_time || '',
              notification_preferences: partnerRecord.notification_preferences || [],
              created_by: partnerRecord.created_by || '',
              addresses,
              anniversary: sharedData?.anniversary,
              partner: undefined,
            };
          }
        }

        return {
          ...record,
          created: record.create_time || '',
          updated: record.update_time || '',
          notification_preferences: record.notification_preferences || [],
          created_by: record.created_by || '',
          addresses,
          anniversary: sharedData?.anniversary,
          partner,
        };
      });

      return people;
    },
  });
}
