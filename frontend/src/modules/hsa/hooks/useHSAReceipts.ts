/**
 * Hook for fetching HSA receipts
 */

import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { HSAReceipt } from '../types';

export function useHSAReceipts() {
  return useQuery({
    queryKey: queryKeys.module('hsa').list(),
    queryFn: async () => {
      const receipts = await getCollection<HSAReceipt>(
        Collections.HSA_RECEIPTS
      ).getFullList({
        sort: '-service_date',
      });
      return receipts;
    },
  });
}
