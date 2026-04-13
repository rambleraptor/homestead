/**
 * Single person hook. Client-side joins for address + partner.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Person, NotificationPreference, Address } from '../types';
import { findSharedDataForPerson } from '../utils/sharedDataSync';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences?: NotificationPreference[];
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

function normalize(rec: PersonRecord): PersonRecord & { created: string; updated: string; notification_preferences: NotificationPreference[]; created_by: string } {
  return {
    ...rec,
    created: rec.create_time || '',
    updated: rec.update_time || '',
    notification_preferences: rec.notification_preferences || [],
    created_by: rec.created_by || '',
  };
}

export function usePersonById(id: string) {
  return useQuery({
    queryKey: queryKeys.module('people').detail(id),
    queryFn: async () => {
      const rawRecord = await aepbase.get<PersonRecord>(AepCollections.PEOPLE, id);
      const record = normalize(rawRecord);
      const sharedData = await findSharedDataForPerson(id);

      const addresses: Address[] = [];
      if (sharedData) {
        if (sharedData.address_id) {
          try {
            const primary = await aepbase.get<Address>(
              AepCollections.ADDRESSES,
              sharedData.address_id,
            );
            addresses.push(primary);
          } catch {
            // missing; ignore
          }
        }
        try {
          const all = await aepbase.list<Address>(AepCollections.ADDRESSES);
          for (const address of all) {
            if (
              address.shared_data_id === sharedData.id &&
              address.id !== sharedData.address_id
            ) {
              addresses.push(address);
            }
          }
        } catch {
          // ignore
        }
      }

      let partner: Person | undefined;
      if (sharedData) {
        const partnerId =
          sharedData.person_a === id ? sharedData.person_b : sharedData.person_a;
        if (partnerId) {
          const partnerRaw = await aepbase.get<PersonRecord>(
            AepCollections.PEOPLE,
            partnerId,
          );
          const partnerRecord = normalize(partnerRaw);
          partner = {
            ...partnerRecord,
            addresses,
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
