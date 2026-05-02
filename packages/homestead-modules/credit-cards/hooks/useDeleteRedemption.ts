/**
 * Delete Redemption Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { findRedemptionParents } from './_aepLookup';

export function useDeleteRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { creditCardId, perkId } = findRedemptionParents(queryClient, id);
      await aepbase.remove(AepCollections.PERK_REDEMPTIONS, id, {
        parent: [
          AepCollections.CREDIT_CARDS, creditCardId,
          AepCollections.CREDIT_CARD_PERKS, perkId,
        ],
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('credit-cards').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('credit-cards').all() });
      logger.info('Redemption deleted successfully');
    },
    onError: (error) => logger.error('Failed to delete redemption', error),
  });
}
