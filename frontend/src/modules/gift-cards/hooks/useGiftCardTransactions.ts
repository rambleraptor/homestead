/**
 * Gift Card Transactions Query Hook
 *
 * Transactions are a child of gift-cards in aepbase, addressed via the URL
 * (`/gift-cards/{id}/transactions`) rather than a filter.
 */

import { AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepList } from '@/core/api/resourceHooks';
import type { GiftCardTransaction } from '../types';

export function useGiftCardTransactions(giftCardId: string | null) {
  return useAepList<GiftCardTransaction>(AepCollections.GIFT_CARD_TRANSACTIONS, {
    moduleId: 'gift-cards',
    queryKey: [
      ...queryKeys.module('gift-cards').all(),
      'transactions',
      giftCardId || '',
    ],
    parent: giftCardId ? [AepCollections.GIFT_CARDS, giftCardId] : undefined,
    enabled: !!giftCardId,
    sort: (a, b) => (b.create_time || '').localeCompare(a.create_time || ''),
  });
}
