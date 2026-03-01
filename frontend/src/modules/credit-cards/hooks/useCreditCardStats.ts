/**
 * Credit Card Stats Hook
 *
 * Computes dashboard statistics from cards, perks, and redemptions
 */

import { useMemo } from 'react';
import { getAnnualizedValue } from '../utils/periodUtils';
import type { CreditCard, CreditCardPerk, PerkRedemption, DashboardStats, CardStats } from '../types';

export function useCreditCardStats(
  cards: CreditCard[],
  perks: CreditCardPerk[],
  redemptions: PerkRedemption[]
): DashboardStats | undefined {
  return useMemo(() => {
    if (!cards.length) return undefined;

    const activeCards = cards.filter((c) => !c.archived);

    // Get current year boundaries for YTD calculation
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31);

    const cardStats: CardStats[] = activeCards.map((card) => {
      const cardPerks = perks.filter((p) => p.credit_card === card.id);
      const totalPerkValuePerYear = cardPerks.reduce(
        (sum, p) => sum + getAnnualizedValue(p.value, p.frequency),
        0
      );

      // Sum redemptions for this card's perks in current year
      const cardPerkIds = new Set(cardPerks.map((p) => p.id));
      const ytdRedeemed = redemptions
        .filter((r) => {
          if (!cardPerkIds.has(r.perk)) return false;
          const redeemedAt = new Date(r.redeemed_at);
          return redeemedAt >= yearStart && redeemedAt <= yearEnd;
        })
        .reduce((sum, r) => sum + r.amount, 0);

      const coveragePercent = card.annual_fee > 0
        ? Math.round((ytdRedeemed / card.annual_fee) * 100)
        : ytdRedeemed > 0 ? 100 : 0;

      return {
        cardId: card.id,
        annualFee: card.annual_fee,
        totalPerkValuePerYear,
        ytdRedeemed,
        coveragePercent,
        netValue: ytdRedeemed - card.annual_fee,
      };
    });

    const totalAnnualFees = cardStats.reduce((sum, s) => sum + s.annualFee, 0);
    const totalPerkValuePerYear = cardStats.reduce((sum, s) => sum + s.totalPerkValuePerYear, 0);
    const ytdRedeemed = cardStats.reduce((sum, s) => sum + s.ytdRedeemed, 0);
    const overallCoveragePercent = totalAnnualFees > 0
      ? Math.round((ytdRedeemed / totalAnnualFees) * 100)
      : ytdRedeemed > 0 ? 100 : 0;

    return {
      totalAnnualFees,
      totalPerkValuePerYear,
      ytdRedeemed,
      overallCoveragePercent,
      netValue: ytdRedeemed - totalAnnualFees,
      cardStats,
    };
  }, [cards, perks, redemptions]);
}
