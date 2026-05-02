/**
 * Create Credit Card Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { CreditCard, CreditCardFormData } from '../types';

export function useCreateCreditCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreditCardFormData): Promise<CreditCard> => {
      const userId = aepbase.getCurrentUser()?.id;
      return await aepbase.create<CreditCard>(AepCollections.CREDIT_CARDS, {
        ...data,
        archived: data.archived ?? false,
        created_by: userId ? `users/${userId}` : undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('credit-cards').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('credit-cards').all() });
      logger.info('Credit card created successfully');
    },
    onError: (error) => logger.error('Failed to create credit card', error),
  });
}
