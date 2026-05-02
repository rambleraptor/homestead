/**
 * Remove a hand from localStorage by id.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { loadHands, saveHands } from '../storage';

export function useDeleteHand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      saveHands(loadHands().filter((hand) => hand.id !== id));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('bridge').all(),
      });
    },
  });
}
