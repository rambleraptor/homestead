/**
 * Upcoming Perks Hook
 *
 * Computes which perks haven't been redeemed for their current period
 */

import { useMemo } from 'react';
import { getCurrentPeriod } from '../utils/periodUtils';
import type { CreditCard, CreditCardPerk, PerkRedemption, UpcomingPerk } from '../types';

export function useUpcomingPerks(
  cards: CreditCard[],
  perks: CreditCardPerk[],
  redemptions: PerkRedemption[]
): UpcomingPerk[] {
  return useMemo(() => {
    const activeCards = cards.filter((c) => !c.archived);
    const result: UpcomingPerk[] = [];

    for (const card of activeCards) {
      const cardPerks = perks.filter((p) => p.credit_card === card.id);

      for (const perk of cardPerks) {
        const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);

        // Check if this perk has been redeemed for the current period
        const isRedeemed = redemptions.some((r) => {
          if (r.perk !== perk.id) return false;
          const rStart = new Date(r.period_start);
          const rEnd = new Date(r.period_end);
          // Match if the redemption's period overlaps with the current period
          return rStart.getTime() === period.start.getTime() && rEnd.getTime() === period.end.getTime();
        });

        result.push({
          perk,
          card,
          currentPeriod: period,
          isRedeemed,
        });
      }
    }

    // Sort: unredeemed first, then by period end (soonest deadline first)
    result.sort((a, b) => {
      if (a.isRedeemed !== b.isRedeemed) return a.isRedeemed ? 1 : -1;
      return a.currentPeriod.end.getTime() - b.currentPeriod.end.getTime();
    });

    return result;
  }, [cards, perks, redemptions]);
}
