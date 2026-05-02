import { useMemo } from 'react';
import { getAnnualizedValue, dateKey } from '../utils/periodUtils';
import type { CreditCard, CreditCardPerk, PerkRedemption, DashboardStats, CardStats } from '../types';

function coverage(redeemed: number, fee: number): number {
  if (fee > 0) return Math.round((redeemed / fee) * 100);
  return redeemed > 0 ? 100 : 0;
}

export function useCreditCardStats(
  cards: CreditCard[],
  perks: CreditCardPerk[],
  redemptions: PerkRedemption[],
): DashboardStats | undefined {
  return useMemo(() => {
    if (!cards.length) return undefined;

    const yearPrefix = `${new Date().getFullYear()}-`;

    const cardStats: CardStats[] = cards
      .filter((c) => !c.archived)
      .map((card) => {
        const cardPerks = perks.filter((p) => p.credit_card === card.id);
        const cardPerkIds = new Set(cardPerks.map((p) => p.id));

        const totalPerkValuePerYear = cardPerks.reduce(
          (sum, p) => sum + getAnnualizedValue(p.value, p.frequency),
          0,
        );

        const ytdRedeemed = redemptions
          .filter((r) => {
            if (!cardPerkIds.has(r.perk)) return false;
            return dateKey(r.period_start).startsWith(yearPrefix);
          })
          .reduce((sum, r) => sum + r.amount, 0);

        return {
          cardId: card.id,
          annualFee: card.annual_fee,
          totalPerkValuePerYear,
          ytdRedeemed,
          coveragePercent: coverage(ytdRedeemed, card.annual_fee),
          netValue: ytdRedeemed - card.annual_fee,
        };
      });

    const totalAnnualFees = cardStats.reduce((sum, s) => sum + s.annualFee, 0);
    const totalPerkValuePerYear = cardStats.reduce((sum, s) => sum + s.totalPerkValuePerYear, 0);
    const ytdRedeemed = cardStats.reduce((sum, s) => sum + s.ytdRedeemed, 0);

    return {
      totalAnnualFees,
      totalPerkValuePerYear,
      ytdRedeemed,
      overallCoveragePercent: coverage(ytdRedeemed, totalAnnualFees),
      netValue: ytdRedeemed - totalAnnualFees,
      cardStats,
    };
  }, [cards, perks, redemptions]);
}
