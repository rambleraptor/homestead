/**
 * Delete Gift Card Mutation Hook
 * Cascade-deletes child transactions.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';

export function useDeleteGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await aepbase.remove(AepCollections.GIFT_CARDS, id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
    },
  });
}
