/**
 * Update Credit Card Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { CreditCard, CreditCardFormData } from '../types';

interface UpdateCreditCardParams {
  id: string;
  data: Partial<CreditCardFormData>;
}

export function useUpdateCreditCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateCreditCardParams): Promise<CreditCard> =>
      aepbase.update<CreditCard>(AepCollections.CREDIT_CARDS, id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('credit-cards').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('credit-cards').all() });
      logger.info('Credit card updated successfully');
    },
    onError: (error) => logger.error('Failed to update credit card', error),
  });
}
