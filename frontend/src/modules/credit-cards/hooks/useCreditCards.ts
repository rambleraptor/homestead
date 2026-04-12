/**
 * Credit Cards Query Hook — branches on the `credit-cards` backend flag.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { CreditCard } from '../types';
import { mapPbCreditCard, type PbCreditCardRow } from './_mapPbRecords';

export function useCreditCards() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').list(),
    queryFn: async (): Promise<CreditCard[]> => {
      if (isAepbaseEnabled('credit-cards')) {
        const cards = await aepbase.list<CreditCard>(AepCollections.CREDIT_CARDS);
        return cards.sort((a, b) =>
          (b.create_time || '').localeCompare(a.create_time || ''),
        );
      }
      const rows = await getCollection<PbCreditCardRow>(
        Collections.CREDIT_CARDS,
      ).getFullList({ sort: '-created' });
      return rows.map(mapPbCreditCard);
    },
  });
}
