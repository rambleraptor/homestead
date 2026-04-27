/**
 * Credit Card Perks Query Hook.
 *
 * Perks are nested under credit-cards (no flat /perks endpoint). We list
 * cards first, then list each card's perks, and inject the parent
 * `credit_card` id so `useCreditCardStats` / `useUpcomingPerks` keep
 * working with their existing per-card joins.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepList } from '@/core/api/resourceHooks';
import type { CreditCard, CreditCardPerk } from '../types';

export function useCreditCardPerks() {
  return useAepList<CreditCardPerk>(AepCollections.CREDIT_CARD_PERKS, {
    moduleId: 'credit-cards',
    queryKey: queryKeys.module('credit-cards').list({ type: 'perks' }),
    queryFn: async () => {
      const cards = await aepbase.list<CreditCard>(AepCollections.CREDIT_CARDS);
      const all: CreditCardPerk[] = [];
      for (const card of cards) {
        const perks = await aepbase.list<CreditCardPerk>(
          AepCollections.CREDIT_CARD_PERKS,
          { parent: [AepCollections.CREDIT_CARDS, card.id] },
        );
        for (const p of perks) all.push({ ...p, credit_card: card.id });
      }
      return all;
    },
    sort: (a, b) => a.name.localeCompare(b.name),
  });
}
