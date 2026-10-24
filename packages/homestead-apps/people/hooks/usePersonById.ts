import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { ADDRESSES, PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { Address } from '../types';
import { findSharedDataForPerson } from '../utils/sharedDataSync';
import { listRelationships } from '../utils/relationshipSync';
import { relativesFor } from '../utils/relationships';
import { toPerson, type PersonRecord } from './usePeople';

export function usePersonById(id: string) {
  return useQuery({
    queryKey: queryKeys.app('people').detail(id),
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

      // Relatives are named from the whole people list (household-sized).
      const [relationships, people] = await Promise.all([
        listRelationships(),
        aepbase.list<PersonRecord>(PEOPLE),
      ]);
      const nameById = new Map(people.map((p) => [p.id, p.name]));

      return toPerson(record, addresses, relativesFor(id, relationships, nameById));
    },
    enabled: !!id,
  });
}
