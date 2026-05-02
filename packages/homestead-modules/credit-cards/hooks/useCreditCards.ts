/**
 * Credit Cards Query Hook.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { CreditCard } from '../types';

export function useCreditCards() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').list(),
    queryFn: async (): Promise<CreditCard[]> => {
      const cards = await aepbase.list<CreditCard>(AepCollections.CREDIT_CARDS);
      return cards.sort((a, b) =>
        (b.create_time || '').localeCompare(a.create_time || ''),
      );
    },
  });
}
