/**
 * Merchant Summaries Hook
 *
 * Computes merchant summaries from gift cards data and includes merchant logos
 */

import { useMemo } from 'react';
import { useGiftCards } from './useGiftCards';
import { useMerchants } from './useMerchants';
import type { MerchantSummary, GiftCardStats, GiftCard } from '../types';

export function useMerchantSummaries() {
  const { data: giftCards, ...queryResult } = useGiftCards();
  const { data: merchants } = useMerchants();

  const stats: GiftCardStats | undefined = useMemo(() => {
    if (!giftCards) return undefined;

    // Create a map of merchant names to logo URLs
    const merchantLogos = new Map<string, string | undefined>();
    if (merchants) {
      merchants.forEach((merchant) => {
        merchantLogos.set(merchant.name, merchant.logo_url);
      });
    }

    // Group cards by merchant
    const merchantMap = new Map<string, MerchantSummary>();

    giftCards.forEach((card: GiftCard) => {
      const existing = merchantMap.get(card.merchant);
      if (existing) {
        existing.totalAmount += card.amount;
        existing.cardCount += 1;
        existing.cards.push(card);
      } else {
        merchantMap.set(card.merchant, {
          merchant: card.merchant,
          totalAmount: card.amount,
          cardCount: 1,
          cards: [card],
          logo_url: merchantLogos.get(card.merchant),
        });
      }
    });

    const merchantsList = Array.from(merchantMap.values())
      .map((merchant) => ({
        ...merchant,
        // Merchant is archived if total balance is 0
        archived: merchant.totalAmount === 0,
      }))
      .sort((a, b) => a.merchant.localeCompare(b.merchant));

    return {
      totalCards: giftCards.length,
      totalAmount: merchantsList.reduce((sum, m) => sum + m.totalAmount, 0),
      merchantCount: merchantsList.length,
      merchants: merchantsList,
    };
  }, [giftCards, merchants]);

  return {
    stats,
    ...queryResult,
  };
}
