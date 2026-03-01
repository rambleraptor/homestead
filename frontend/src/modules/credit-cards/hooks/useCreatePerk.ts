/**
 * Create Perk Mutation Hook
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { CreditCardPerk, PerkFormData } from '../types';

export function useCreatePerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PerkFormData) => {
      const currentUser = getCurrentUser();
      return await getCollection<CreditCardPerk>(Collections.CREDIT_CARD_PERKS).create({
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
      logger.info('Perk created successfully');
    },
    onError: (error) => {
      logger.error('Failed to create perk', error);
    },
  });
}
