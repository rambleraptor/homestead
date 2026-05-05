import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { ADDRESSES, PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { Person, Address } from '../types';
import { findSharedDataForPerson } from '../utils/sharedDataSync';

interface PersonRecord {
  id: string;
  name: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

function toPerson(
  record: PersonRecord,
  addresses: Address[],
  partner?: Person,
): Person {
  return {
    ...record,
    created: record.create_time || '',
    updated: record.update_time || '',
    created_by: record.created_by || '',
    addresses,
    partner,
  };
}

export function usePersonById(id: string) {
  return useQuery({
    queryKey: queryKeys.module('people').detail(id),
    queryFn: async () => {
      const record = await aepbase.get<PersonRecord>(PEOPLE, id);
      const sharedData = await findSharedDataForPerson(id);

      const addresses: Address[] = [];
      if (sharedData) {
        const all = await aepbase.list<Address>(ADDRESSES).catch(() => []);
        const primary = sharedData.address_id
          ? all.find((a) => a.id === sharedData.address_id)
          : undefined;
        if (primary) addresses.push(primary);
        for (const address of all) {
          if (address.shared_data_id === sharedData.id && address.id !== sharedData.address_id) {
            addresses.push(address);
          }
        }
      }

      let partner: Person | undefined;
      const partnerId = sharedData
        ? sharedData.person_a === id ? sharedData.person_b : sharedData.person_a
        : undefined;
      if (partnerId) {
        const partnerRecord = await aepbase.get<PersonRecord>(PEOPLE, partnerId);
        partner = toPerson(partnerRecord, addresses);
      }

      return toPerson(record, addresses, partner);
    },
    enabled: !!id,
  });
}
