/**
 * Credit Card Perks Query Hook — branches on the `credit-cards` flag.
 *
 * In aepbase, perks are nested under credit-cards (no flat /perks endpoint),
 * so we list cards first and then list each card's perks. The mapper-style
 * `credit_card` field is injected from the parent id so the consumers
 * (`useCreditCardStats`, `useUpcomingPerks`) can keep joining by it.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { CreditCard, CreditCardPerk } from '../types';
import { mapPbPerk, type PbPerkRow } from './_mapPbRecords';

export function useCreditCardPerks() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').list({ type: 'perks' }),
    queryFn: async (): Promise<CreditCardPerk[]> => {
      if (isAepbaseEnabled('credit-cards')) {
        const cards = await aepbase.list<CreditCard>(AepCollections.CREDIT_CARDS);
        const all: CreditCardPerk[] = [];
        for (const card of cards) {
          const perks = await aepbase.list<CreditCardPerk>(
            AepCollections.CREDIT_CARD_PERKS,
            { parent: [AepCollections.CREDIT_CARDS, card.id] },
          );
          for (const p of perks) all.push({ ...p, credit_card: card.id });
        }
        return all.sort((a, b) => a.name.localeCompare(b.name));
      }
      const rows = await getCollection<PbPerkRow>(
        Collections.CREDIT_CARD_PERKS,
      ).getFullList({ sort: 'name' });
      return rows.map(mapPbPerk);
    },
  });
}
