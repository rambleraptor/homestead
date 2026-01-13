/**
 * Hook for deleting HSA receipts
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';

export function useDeleteHSAReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await getCollection(Collections.HSA_RECEIPTS).delete(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('hsa').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('hsa').all(),
      });
      logger.info('HSA receipt deleted successfully');
    },
    onError: (error) => {
      logger.error('Failed to delete HSA receipt', error);
    },
  });
}
