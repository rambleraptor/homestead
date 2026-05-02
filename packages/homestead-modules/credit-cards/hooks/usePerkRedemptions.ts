/**
 * Perk Redemptions Query Hook.
 *
 * Redemptions are two levels deep (`/credit-cards/{id}/perks/{id}/redemptions`).
 * We walk cards → perks → redemptions and inject the `perk` parent id on
 * each result so the compute hooks can keep joining by it.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import type { CreditCard, CreditCardPerk, PerkRedemption } from '../types';

export function usePerkRedemptions() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').list({ type: 'redemptions' }),
    queryFn: async (): Promise<PerkRedemption[]> => {
      const cards = await aepbase.list<CreditCard>(AepCollections.CREDIT_CARDS);
      const all: PerkRedemption[] = [];
      for (const card of cards) {
        const perks = await aepbase.list<CreditCardPerk>(
          AepCollections.CREDIT_CARD_PERKS,
          { parent: [AepCollections.CREDIT_CARDS, card.id] },
        );
        for (const perk of perks) {
          const reds = await aepbase.list<PerkRedemption>(
            AepCollections.PERK_REDEMPTIONS,
            {
              parent: [
                AepCollections.CREDIT_CARDS, card.id,
                AepCollections.CREDIT_CARD_PERKS, perk.id,
              ],
            },
          );
          for (const r of reds) all.push({ ...r, perk: perk.id });
        }
      }
      return all.sort((a, b) =>
        (b.period_start || '').localeCompare(a.period_start || ''),
      );
    },
  });
}
