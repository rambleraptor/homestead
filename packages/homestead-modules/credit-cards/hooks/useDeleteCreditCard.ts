/**
 * Delete Credit Card Mutation Hook. Cascade-deletes child perks + redemptions.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';

export function useDeleteCreditCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await aepbase.remove(AepCollections.CREDIT_CARDS, id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('credit-cards').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('credit-cards').all() });
      logger.info('Credit card deleted successfully');
    },
    onError: (error) => logger.error('Failed to delete credit card', error),
  });
}
