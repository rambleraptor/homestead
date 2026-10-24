import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE, PERSON_RELATIONSHIPS } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { Household, Person, PersonRelationship } from '../types';
import { relativesFor, type Relatives } from '../utils/relationships';
import { householdsFor } from '../utils/households';
import { listHouseholds } from '../utils/householdSync';

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
  households: Household[],
  relatives: Relatives,
): Person {
  return {
    ...record,
    aliases: record.aliases ?? [],
    created: record.create_time || '',
    updated: record.update_time || '',
    created_by: record.created_by || '',
    households,
    ...relatives,
  };
}

// Joins people + households + relationships client-side — aepbase doesn't
// support server-side joining. Filtering happens in the list component via
// the shared FilterBar; this hook always returns the full collection.
export function usePeople() {
  return useQuery({
    queryKey: queryKeys.app('people').list(),
    queryFn: async () => {
      const [peopleRecords, households, relationships] = await Promise.all([
        aepbase.list<PersonRecord>(PEOPLE),
        listHouseholds(),
        aepbase.list<PersonRelationship>(PERSON_RELATIONSHIPS),
      ]);

      peopleRecords.sort((a, b) => a.name.localeCompare(b.name));
      const nameById = new Map(peopleRecords.map((p) => [p.id, p.name]));

      return peopleRecords.map((record) =>
        toPerson(
          record,
          householdsFor(record.id, households),
          relativesFor(record.id, relationships, nameById),
        ),
      );
    },
  });
}
