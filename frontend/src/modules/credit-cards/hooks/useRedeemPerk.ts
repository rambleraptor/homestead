/**
 * Redeem Perk Mutation Hook
 *
 * Creates a redemption record for the current period
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import { getCurrentPeriod } from '../utils/periodUtils';
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
    mutationFn: async ({ perk, card, amount, notes }: RedeemPerkParams) => {
      const currentUser = getCurrentUser();
      const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);

      const toISODate = (d: Date) => d.toISOString().split('T')[0];

      return await getCollection<PerkRedemption>(Collections.PERK_REDEMPTIONS).create({
        perk: perk.id,
        period_start: toISODate(period.start),
        period_end: toISODate(period.end),
        redeemed_at: toISODate(new Date()),
        amount,
        notes,
        created_by: currentUser?.id,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Perk redeemed successfully');
    },
    onError: (error) => {
      logger.error('Failed to redeem perk', error);
    },
  });
}
