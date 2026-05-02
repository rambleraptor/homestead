/**
 * Update Redemption Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { PerkRedemption, RedemptionFormData } from '../types';
import { findRedemptionParents } from './_aepLookup';

interface UpdateRedemptionParams {
  id: string;
  data: Partial<RedemptionFormData>;
}

export function useUpdateRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateRedemptionParams): Promise<PerkRedemption> => {
      const { creditCardId, perkId } = findRedemptionParents(queryClient, id);
      const { perk: _ignore, ...body } = data;
      const updated = await aepbase.update<PerkRedemption>(
        AepCollections.PERK_REDEMPTIONS,
        id,
        body,
        {
          parent: [
            AepCollections.CREDIT_CARDS, creditCardId,
            AepCollections.CREDIT_CARD_PERKS, perkId,
          ],
        },
      );
      return { ...updated, perk: perkId };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('credit-cards').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('credit-cards').all() });
      logger.info('Redemption updated successfully');
    },
    onError: (error) => logger.error('Failed to update redemption', error),
  });
}
