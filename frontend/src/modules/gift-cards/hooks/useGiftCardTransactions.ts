/**
 * Gift Card Transactions Query Hook
 *
 * Transactions are a child of gift-cards in aepbase, addressed via the URL
 * (`/gift-cards/{id}/transactions`) rather than a filter.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { GiftCardTransaction } from '../types';

export function useGiftCardTransactions(giftCardId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.module('gift-cards').all(), 'transactions', giftCardId || ''],
    queryFn: async () => {
      if (!giftCardId) return [];
      const txs = await aepbase.list<GiftCardTransaction>(
        AepCollections.GIFT_CARD_TRANSACTIONS,
        { parent: [AepCollections.GIFT_CARDS, giftCardId] },
      );
      return txs.sort((a, b) =>
        (b.create_time || '').localeCompare(a.create_time || ''),
      );
    },
    enabled: !!giftCardId,
  });
}
