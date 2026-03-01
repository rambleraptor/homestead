/**
 * Create Credit Card Mutation Hook
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { CreditCard, CreditCardFormData } from '../types';

export function useCreateCreditCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreditCardFormData) => {
      const currentUser = getCurrentUser();
      return await getCollection<CreditCard>(Collections.CREDIT_CARDS).create({
        ...data,
        archived: data.archived ?? false,
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
      logger.info('Credit card created successfully');
    },
    onError: (error) => {
      logger.error('Failed to create credit card', error);
    },
  });
}
