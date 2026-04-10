/**
 * Delete Credit Card Mutation Hook — branches on the `credit-cards` flag.
 * Both backends cascade-delete child perks and redemptions.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';

export function useDeleteCreditCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isAepbaseEnabled('credit-cards')) {
        await aepbase.remove(AepCollections.CREDIT_CARDS, id);
        return;
      }
      await getCollection(Collections.CREDIT_CARDS).delete(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Credit card deleted successfully');
    },
    onError: (error) => {
      logger.error('Failed to delete credit card', error);
    },
  });
}
