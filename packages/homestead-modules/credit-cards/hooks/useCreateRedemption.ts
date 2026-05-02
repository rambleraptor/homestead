/**
 * Create Redemption Mutation Hook.
 *
 * Unlike `useRedeemPerk` this accepts explicit period dates for historical
 * entries. The parent card id is recovered from the cached perks list.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { PerkRedemption, RedemptionFormData } from '../types';
import { findPerkParentCardId } from './_aepLookup';

export function useCreateRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RedemptionFormData): Promise<PerkRedemption> => {
      const userId = aepbase.getCurrentUser()?.id;
      const cardId = findPerkParentCardId(queryClient, data.perk);
      const { perk: perkId, ...body } = data;
      const created = await aepbase.create<PerkRedemption>(
        AepCollections.PERK_REDEMPTIONS,
        { ...body, created_by: userId ? `users/${userId}` : undefined },
        {
          parent: [
            AepCollections.CREDIT_CARDS, cardId,
            AepCollections.CREDIT_CARD_PERKS, perkId,
          ],
        },
      );
      return { ...created, perk: perkId };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('credit-cards').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('credit-cards').all() });
      logger.info('Redemption created successfully');
    },
    onError: (error) => logger.error('Failed to create redemption', error),
  });
}
