/**
 * Redeem Perk Mutation Hook.
 *
 * Creates a redemption record for the current period. Caller passes the
 * perk and card, so parent URL is fully resolvable.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import { getCurrentPeriod } from '../utils/periodUtils';
import type { PerkRedemption, CreditCardPerk, CreditCard } from '../types';

interface RedeemPerkParams {
  perk: CreditCardPerk;
  card: CreditCard;
  amount: number;
  notes?: string;
}

export function useRedeemPerk() {
  return useAepCreate<PerkRedemption, RedeemPerkParams>(
    AepCollections.PERK_REDEMPTIONS,
    {
      moduleId: 'credit-cards',
      mutationFn: async ({ perk, card, amount, notes }) => {
        const period = getCurrentPeriod(
          perk.frequency,
          card.reset_mode,
          card.anniversary_date,
        );
        const toISODate = (d: Date) => d.toISOString().split('T')[0];

        const created = await aepbase.create<PerkRedemption>(
          AepCollections.PERK_REDEMPTIONS,
          {
            period_start: toISODate(period.start),
            period_end: toISODate(period.end),
            redeemed_at: toISODate(new Date()),
            amount,
            notes,
            created_by: currentUserPath(),
          },
          {
            parent: [
              AepCollections.CREDIT_CARDS, card.id,
              AepCollections.CREDIT_CARD_PERKS, perk.id,
            ],
          },
        );
        return { ...created, perk: perk.id };
      },
    },
  );
}
