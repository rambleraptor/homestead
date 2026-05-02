/**
 * Gift Cards Query Hook
 *
 * aepbase has no `sort` query param, so we order client-side by
 * `create_time` desc (newest first).
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import type { GiftCard } from '../types';

export function useGiftCards() {
  return useQuery({
    queryKey: queryKeys.module('gift-cards').list(),
    queryFn: async (): Promise<GiftCard[]> => {
      const cards = await aepbase.list<GiftCard>(AepCollections.GIFT_CARDS);
      return cards.sort((a, b) =>
        (b.create_time || '').localeCompare(a.create_time || ''),
      );
    },
  });
}
