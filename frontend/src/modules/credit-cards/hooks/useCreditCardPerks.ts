/**
 * Credit Card Perks Query Hook
 *
 * Fetches all perks from PocketBase
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { CreditCardPerk } from '../types';

export function useCreditCardPerks() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').list({ type: 'perks' }),
    queryFn: async () => {
      const perks = await getCollection<CreditCardPerk>(Collections.CREDIT_CARD_PERKS).getFullList({
        sort: 'name',
      });
      return perks;
    },
  });
}
