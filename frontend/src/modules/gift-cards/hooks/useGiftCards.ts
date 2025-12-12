/**
 * Gift Cards Query Hook
 *
 * Fetches all gift cards from PocketBase
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { GiftCard } from '../types';

export function useGiftCards() {
  return useQuery({
    queryKey: queryKeys.module('gift-cards').list(),
    queryFn: async () => {
      const cards = await getCollection<GiftCard>(Collections.GIFT_CARDS).getFullList({
        sort: '-id',
      });
      return cards;
    },
  });
}
