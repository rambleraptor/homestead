/**
 * Credit Cards Query Hook
 *
 * Fetches all credit cards from PocketBase
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { CreditCard } from '../types';

export function useCreditCards() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').list(),
    queryFn: async () => {
      const cards = await getCollection<CreditCard>(Collections.CREDIT_CARDS).getFullList({
        sort: '-created',
      });
      return cards;
    },
  });
}
