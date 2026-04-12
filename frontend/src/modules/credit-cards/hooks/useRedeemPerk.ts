/**
 * Redeem Perk Mutation Hook — branches on the `credit-cards` flag.
 *
 * Creates a redemption record for the current period. Caller passes both
 * perk and card so we already have the parent path for aepbase.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import { getCurrentPeriod } from '../utils/periodUtils';
import type { PerkRedemption, CreditCardPerk, CreditCard } from '../types';
import { mapPbRedemption, type PbRedemptionRow } from './_mapPbRecords';

interface RedeemPerkParams {
  perk: CreditCardPerk;
  card: CreditCard;
  amount: number;
  notes?: string;
}

export function useRedeemPerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      perk,
      card,
      amount,
      notes,
    }: RedeemPerkParams): Promise<PerkRedemption> => {
      const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);
      const toISODate = (d: Date) => d.toISOString().split('T')[0];

      const body = {
        period_start: toISODate(period.start),
        period_end: toISODate(period.end),
        redeemed_at: toISODate(new Date()),
        amount,
        notes,
      };

      if (isAepbaseEnabled('credit-cards')) {
        const aepUserId = aepbase.getCurrentUser()?.id;
        const created = await aepbase.create<PerkRedemption>(
          AepCollections.PERK_REDEMPTIONS,
          {
            ...body,
            created_by: aepUserId ? `users/${aepUserId}` : undefined,
          },
          {
            parent: [
              AepCollections.CREDIT_CARDS,
              card.id,
              AepCollections.CREDIT_CARD_PERKS,
              perk.id,
            ],
          },
        );
        return { ...created, perk: perk.id };
      }

      const pbUser = getCurrentUser();
      const rec = await getCollection<PbRedemptionRow>(
        Collections.PERK_REDEMPTIONS,
      ).create({
        ...body,
        perk: perk.id,
        created_by: pbUser?.id,
      });
      return mapPbRedemption(rec);
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
