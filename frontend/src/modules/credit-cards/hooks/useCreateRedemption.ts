/**
 * Create Redemption Mutation Hook
 *
 * Unlike useRedeemPerk (which auto-calculates the current period),
 * this hook accepts explicit period dates for creating historical redemptions.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { PerkRedemption, RedemptionFormData } from '../types';

export function useCreateRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RedemptionFormData) => {
      const currentUser = getCurrentUser();

      return await getCollection<PerkRedemption>(Collections.PERK_REDEMPTIONS).create({
        ...data,
        created_by: currentUser?.id,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Redemption created successfully');
    },
    onError: (error) => {
      logger.error('Failed to create redemption', error);
    },
  });
}
