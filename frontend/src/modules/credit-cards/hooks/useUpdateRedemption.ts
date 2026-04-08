/**
 * Update Redemption Mutation Hook
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { PerkRedemption, RedemptionFormData } from '../types';

interface UpdateRedemptionParams {
  id: string;
  data: Partial<RedemptionFormData>;
}

export function useUpdateRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateRedemptionParams) => {
      return await getCollection<PerkRedemption>(Collections.PERK_REDEMPTIONS).update(id, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Redemption updated successfully');
    },
    onError: (error) => {
      logger.error('Failed to update redemption', error);
    },
  });
}
