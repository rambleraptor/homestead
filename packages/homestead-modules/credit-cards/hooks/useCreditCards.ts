/**
 * Credit Cards Query Hook.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { CREDIT_CARDS } from '../resources';
import type { CreditCard } from '../types';

export function useCreditCards() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').resource('credit-card').list(),
    queryFn: async (): Promise<CreditCard[]> => {
      const cards = await aepbase.list<CreditCard>(CREDIT_CARDS);
      return cards.sort((a, b) =>
        (b.create_time || '').localeCompare(a.create_time || ''),
      );
    },
  });
}
