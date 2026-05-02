import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { ManagedUser } from '../types';

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: async () => {
      const users = await aepbase.list<ManagedUser>(AepCollections.USERS);
      users.sort((a, b) => a.email.localeCompare(b.email));
      return users;
    },
  });
}
