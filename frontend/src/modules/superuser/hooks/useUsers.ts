import { AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepList } from '@/core/api/resourceHooks';
import type { ManagedUser } from '../types';

export function useUsers() {
  return useAepList<ManagedUser>(AepCollections.USERS, {
    moduleId: 'superuser',
    // Users live under the top-level `queryKeys.users` namespace, not the
    // per-module one — so the mutations invalidate `queryKeys.users.all()`
    // and the list query has to read from the same key.
    queryKey: queryKeys.users.list(),
    sort: (a, b) => a.email.localeCompare(b.email),
  });
}
