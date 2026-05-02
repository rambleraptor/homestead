/**
 * Upcoming Perks Hook
 *
 * Computes which perks haven't been redeemed for their current period
 */

import { useMemo } from 'react';
import { getCurrentPeriod, dateKey } from '../utils/periodUtils';
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
        const periodStartKey = dateKey(period.start);
        const periodEndKey = dateKey(period.end);

        const isRedeemed = redemptions.some((r) => {
          if (r.perk !== perk.id) return false;
          return dateKey(r.period_start) === periodStartKey
            && dateKey(r.period_end) === periodEndKey;
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
