import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { Person, PersonSharedData, Address } from '../types';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

function toPerson(
  record: PersonRecord,
  addresses: Address[],
  anniversary?: string,
  partner?: Person,
): Person {
  return {
    ...record,
    created: record.create_time || '',
    updated: record.update_time || '',
    created_by: record.created_by || '',
    addresses,
    anniversary,
    partner,
  };
}

// Joins people + person_shared_data + addresses client-side — aepbase doesn't
// support server-side joining. Filtering happens in the list component via
// the shared FilterBar; this hook always returns the full collection.
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

      const sharedByPerson = new Map<string, PersonSharedData>();
      for (const sd of allSharedData) {
        sharedByPerson.set(sd.person_a, sd);
        if (sd.person_b) sharedByPerson.set(sd.person_b, sd);
      }
      const addressById = new Map(allAddresses.map((a) => [a.id, a]));
      const recordById = new Map(peopleRecords.map((p) => [p.id, p]));

      const addressesFor = (sd?: PersonSharedData): Address[] => {
        if (!sd) return [];
        const primary = sd.address_id ? addressById.get(sd.address_id) : undefined;
        const extras = allAddresses.filter(
          (a) => a.shared_data_id === sd.id && a.id !== sd.address_id,
        );
        return primary ? [primary, ...extras] : extras;
      };

      return peopleRecords.map((record) => {
        const sharedData = sharedByPerson.get(record.id);
        const addresses = addressesFor(sharedData);

        const partnerId = sharedData
          ? sharedData.person_a === record.id ? sharedData.person_b : sharedData.person_a
          : undefined;
        const partnerRecord = partnerId ? recordById.get(partnerId) : undefined;
        const partner = partnerRecord
          ? toPerson(partnerRecord, addresses, sharedData?.anniversary)
          : undefined;

        return toPerson(record, addresses, sharedData?.anniversary, partner);
      });
    },
  });
}
