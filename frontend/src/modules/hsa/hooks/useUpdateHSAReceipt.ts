/**
 * Update HSA Receipt — branches on the `hsa-receipts` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
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
      if (isAepbaseEnabled('hsa-receipts')) {
        return await aepbase.update<HSAReceipt>(AepCollections.HSA_RECEIPTS, id, data);
      }
      return await getCollection<HSAReceipt>(Collections.HSA_RECEIPTS).update(id, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('hsa').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('hsa').all() });
      logger.info('HSA receipt updated successfully');
    },
    onError: (error) => {
      logger.error('Failed to update HSA receipt', error);
    },
  });
}
