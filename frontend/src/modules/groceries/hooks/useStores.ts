/**
 * Stores Query Hook
 *
 * Fetches all stores from PocketBase
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { Store } from '../types';

export function useStores() {
  return useQuery({
    queryKey: queryKeys.module('groceries').detail('stores'),
    queryFn: async () => {
      const stores = await getCollection<Store>(Collections.STORES).getFullList({
        sort: 'sort_order,name',
      });
      return stores;
    },
  });
}
