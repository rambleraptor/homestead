/**
 * Gift Card Transactions Query Hook
 *
 * Routes through aepbase (nested URL `/gift-cards/{id}/transactions`) or PB
 * (top-level collection filtered by `gift_card`) based on the gift-cards
 * backend flag. Both paths return aepbase-shaped GiftCardTransaction objects.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { GiftCardTransaction } from '../types';
import { mapPbTransaction } from './_mapPbRecords';

export function useGiftCardTransactions(giftCardId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.module('gift-cards').all(), 'transactions', giftCardId || ''],
    queryFn: async (): Promise<GiftCardTransaction[]> => {
      if (!giftCardId) return [];

      if (isAepbaseEnabled('gift-cards')) {
        const txs = await aepbase.list<GiftCardTransaction>(
          AepCollections.GIFT_CARD_TRANSACTIONS,
          { parent: [AepCollections.GIFT_CARDS, giftCardId] },
        );
        return txs.sort((a, b) =>
          (b.create_time || '').localeCompare(a.create_time || ''),
        );
      }

      const records = await getCollection<Parameters<typeof mapPbTransaction>[0]>(
        Collections.GIFT_CARD_TRANSACTIONS,
      ).getFullList({
        filter: `gift_card = "${giftCardId}"`,
        sort: '-created',
      });
      return records.map(mapPbTransaction);
    },
    enabled: !!giftCardId,
  });
}
