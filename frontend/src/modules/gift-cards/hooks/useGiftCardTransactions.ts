/**
 * Gift Card Transactions Query Hook
 *
 * Fetches transaction history for a specific gift card
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { GiftCardTransaction } from '../types';

export function useGiftCardTransactions(giftCardId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.module('gift-cards').all(), 'transactions', giftCardId || ''],
    queryFn: async () => {
      if (!giftCardId) return [];

      return await getCollection<GiftCardTransaction>(
        Collections.GIFT_CARD_TRANSACTIONS
      ).getFullList({
        filter: `gift_card = "${giftCardId}"`,
        sort: '-created',
      });
    },
    enabled: !!giftCardId,
  });
}
