import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { listRelationships } from '../utils/relationshipSync';
import { relativesFor } from '../utils/relationships';
import { householdsFor } from '../utils/households';
import { listHouseholds } from '../utils/householdSync';
import { toPerson, type PersonRecord } from './usePeople';

export function usePersonById(id: string) {
  return useQuery({
    queryKey: queryKeys.app('people').detail(id),
    queryFn: async () => {
      // Relatives are named from the whole people list (household-sized).
      const [record, households, relationships, people] = await Promise.all([
        aepbase.get<PersonRecord>(PEOPLE, id),
        listHouseholds(),
        listRelationships(),
        aepbase.list<PersonRecord>(PEOPLE),
      ]);
      const nameById = new Map(people.map((p) => [p.id, p.name]));

      return toPerson(
        record,
        householdsFor(id, households),
        relativesFor(id, relationships, nameById),
      );
    },
    enabled: !!id,
  });
}
