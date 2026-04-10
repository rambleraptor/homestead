/**
 * Gift Cards Query Hook
 *
 * Branches on `isAepbaseEnabled('gift-cards')`. The aepbase path uses the
 * thin REST wrapper; the PocketBase path keeps the legacy `getCollection`
 * call and maps each record to the aepbase-shaped GiftCard type so
 * downstream consumers don't care which backend served them.
 *
 * aepbase has no `sort` query param, so we order client-side by
 * `create_time` desc to match PB's previous `-id` behavior.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { GiftCard } from '../types';
import { mapPbGiftCard } from './_mapPbRecords';

export function useGiftCards() {
  return useQuery({
    queryKey: queryKeys.module('gift-cards').list(),
    queryFn: async (): Promise<GiftCard[]> => {
      if (isAepbaseEnabled('gift-cards')) {
        const cards = await aepbase.list<GiftCard>(AepCollections.GIFT_CARDS);
        return cards.sort((a, b) =>
          (b.create_time || '').localeCompare(a.create_time || ''),
        );
      }
      const cards = await getCollection<Parameters<typeof mapPbGiftCard>[0]>(
        Collections.GIFT_CARDS,
      ).getFullList({ sort: '-id' });
      return cards.map(mapPbGiftCard);
    },
  });
}
