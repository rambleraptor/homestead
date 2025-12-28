/**
 * Merchants Query Hook
 *
 * Fetches all merchants from PocketBase
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { Merchant } from '../types';

export function useMerchants() {
  return useQuery({
    queryKey: queryKeys.module('merchants').list(),
    queryFn: async () => {
      const merchants = await getCollection<Merchant>(Collections.MERCHANTS).getFullList({
        sort: 'name',
      });
      return merchants;
    },
  });
}
