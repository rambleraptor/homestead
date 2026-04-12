/**
 * Delete Redemption Mutation Hook — branches on the `credit-cards` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import { findRedemptionParents } from './_aepLookup';

export function useDeleteRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isAepbaseEnabled('credit-cards')) {
        const { creditCardId, perkId } = findRedemptionParents(queryClient, id);
        await aepbase.remove(AepCollections.PERK_REDEMPTIONS, id, {
          parent: [
            AepCollections.CREDIT_CARDS,
            creditCardId,
            AepCollections.CREDIT_CARD_PERKS,
            perkId,
          ],
        });
        return;
      }
      await getCollection(Collections.PERK_REDEMPTIONS).delete(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Redemption deleted successfully');
    },
    onError: (error) => {
      logger.error('Failed to delete redemption', error);
    },
  });
}
