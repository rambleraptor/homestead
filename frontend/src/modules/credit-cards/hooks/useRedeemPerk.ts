/**
 * Redeem Perk Mutation Hook.
 *
 * Creates a redemption record for the current period. Caller passes the
 * perk and card, so parent URL is fully resolvable.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import { getCurrentPeriod, toLocalISODate } from '../utils/periodUtils';
import type { PerkRedemption, CreditCardPerk, CreditCard } from '../types';

interface RedeemPerkParams {
  perk: CreditCardPerk;
  card: CreditCard;
  amount: number;
  notes?: string;
}

export function useRedeemPerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ perk, card, amount, notes }: RedeemPerkParams): Promise<PerkRedemption> => {
      const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);

      const userId = aepbase.getCurrentUser()?.id;
      const created = await aepbase.create<PerkRedemption>(
        AepCollections.PERK_REDEMPTIONS,
        {
          period_start: toLocalISODate(period.start),
          period_end: toLocalISODate(period.end),
          amount,
          notes,
          created_by: userId ? `users/${userId}` : undefined,
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('credit-cards').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('credit-cards').all() });
      logger.info('Perk redeemed successfully');
    },
    onError: (error) => logger.error('Failed to redeem perk', error),
  });
}
