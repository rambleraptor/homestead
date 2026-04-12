/**
 * Delete Perk Mutation Hook — branches on the `credit-cards` flag.
 * Parent card id is looked up from the cached perks list in aepbase mode.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import { findPerkParentCardId } from './_aepLookup';

export function useDeletePerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isAepbaseEnabled('credit-cards')) {
        const cardId = findPerkParentCardId(queryClient, id);
        await aepbase.remove(AepCollections.CREDIT_CARD_PERKS, id, {
          parent: [AepCollections.CREDIT_CARDS, cardId],
        });
        return;
      }
      await getCollection(Collections.CREDIT_CARD_PERKS).delete(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Perk deleted successfully');
    },
    onError: (error) => {
      logger.error('Failed to delete perk', error);
    },
  });
}
