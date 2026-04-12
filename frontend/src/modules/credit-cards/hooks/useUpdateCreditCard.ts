/**
 * Update Credit Card Mutation Hook — branches on the `credit-cards` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { CreditCard, CreditCardFormData } from '../types';
import { mapPbCreditCard, type PbCreditCardRow } from './_mapPbRecords';

interface UpdateCreditCardParams {
  id: string;
  data: Partial<CreditCardFormData>;
}

export function useUpdateCreditCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateCreditCardParams): Promise<CreditCard> => {
      if (isAepbaseEnabled('credit-cards')) {
        return await aepbase.update<CreditCard>(AepCollections.CREDIT_CARDS, id, data);
      }
      const rec = await getCollection<PbCreditCardRow>(
        Collections.CREDIT_CARDS,
      ).update(id, data);
      return mapPbCreditCard(rec);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Credit card updated successfully');
    },
    onError: (error) => {
      logger.error('Failed to update credit card', error);
    },
  });
}
