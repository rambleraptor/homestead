/**
 * Perk Redemptions Query Hook — branches on the `credit-cards` flag.
 *
 * In aepbase redemptions are two levels deep
 * (`/credit-cards/{id}/perks/{id}/redemptions`), so we walk the cards →
 * perks → redemptions tree and inject the `perk` parent id on each result
 * so the compute hooks can keep joining by it.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { CreditCard, CreditCardPerk, PerkRedemption } from '../types';
import { mapPbRedemption, type PbRedemptionRow } from './_mapPbRecords';

export function usePerkRedemptions() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').list({ type: 'redemptions' }),
    queryFn: async (): Promise<PerkRedemption[]> => {
      if (isAepbaseEnabled('credit-cards')) {
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
                  AepCollections.CREDIT_CARDS,
                  card.id,
                  AepCollections.CREDIT_CARD_PERKS,
                  perk.id,
                ],
              },
            );
            for (const r of reds) all.push({ ...r, perk: perk.id });
          }
        }
        return all.sort((a, b) =>
          (b.redeemed_at || '').localeCompare(a.redeemed_at || ''),
        );
      }
      const rows = await getCollection<PbRedemptionRow>(
        Collections.PERK_REDEMPTIONS,
      ).getFullList({ sort: '-redeemed_at' });
      return rows.map(mapPbRedemption);
    },
  });
}
