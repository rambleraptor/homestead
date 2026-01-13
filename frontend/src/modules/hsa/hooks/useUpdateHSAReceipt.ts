/**
 * Hook for updating HSA receipts
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { HSAReceipt } from '../types';

interface UpdateHSAReceiptParams {
  id: string;
  data: Partial<HSAReceipt>;
}

export function useUpdateHSAReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateHSAReceiptParams) => {
      return await getCollection<HSAReceipt>(Collections.HSA_RECEIPTS).update(id, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('hsa').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('hsa').all(),
      });
      logger.info('HSA receipt updated successfully');
    },
    onError: (error) => {
      logger.error('Failed to update HSA receipt', error);
    },
  });
}
