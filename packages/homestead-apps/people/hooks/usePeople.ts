import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { ADDRESSES, PEOPLE, PERSON_RELATIONSHIPS, PERSON_SHARED_DATA } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { Person, PersonRelationship, PersonSharedData, Address } from '../types';
import { relativesFor, type Relatives } from '../utils/relationships';

export interface PersonRecord {
  id: string;
  name: string;
  aliases?: string[];
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

export function toPerson(
  record: PersonRecord,
  addresses: Address[],
  relatives: Relatives,
): Person {
  return {
    ...record,
    aliases: record.aliases ?? [],
    created: record.create_time || '',
    updated: record.update_time || '',
    created_by: record.created_by || '',
    addresses,
    ...relatives,
  };
}

// Joins people + person_shared_data + addresses + relationships client-side — aepbase doesn't
// support server-side joining. Filtering happens in the list component via
// the shared FilterBar; this hook always returns the full collection.
export function usePeople() {
  return useQuery({
    queryKey: queryKeys.app('people').list(),
    queryFn: async () => {
      const [peopleRecords, allSharedData, allAddresses, relationships] = await Promise.all([
        aepbase.list<PersonRecord>(PEOPLE),
        aepbase.list<PersonSharedData>(PERSON_SHARED_DATA),
        aepbase.list<Address>(ADDRESSES),
        aepbase.list<PersonRelationship>(PERSON_RELATIONSHIPS),
      ]);

      peopleRecords.sort((a, b) => a.name.localeCompare(b.name));

      const sharedByPerson = new Map<string, PersonSharedData>();
      for (const sd of allSharedData) {
        sharedByPerson.set(sd.person_a, sd);
        if (sd.person_b) sharedByPerson.set(sd.person_b, sd);
      }
      const addressById = new Map(allAddresses.map((a) => [a.id, a]));
      const nameById = new Map(peopleRecords.map((p) => [p.id, p.name]));

      const addressesFor = (sd?: PersonSharedData): Address[] => {
        if (!sd) return [];
        const primary = sd.address_id ? addressById.get(sd.address_id) : undefined;
        const extras = allAddresses.filter(
          (a) => a.shared_data_id === sd.id && a.id !== sd.address_id,
        );
        return primary ? [primary, ...extras] : extras;
      };

      return peopleRecords.map((record) =>
        toPerson(
          record,
          addressesFor(sharedByPerson.get(record.id)),
          relativesFor(record.id, relationships, nameById),
        ),
      );
    },
  });
}
