/**
 * Create Credit Card Mutation Hook — branches on the `credit-cards` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { CreditCard, CreditCardFormData } from '../types';
import { mapPbCreditCard, type PbCreditCardRow } from './_mapPbRecords';

export function useCreateCreditCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreditCardFormData): Promise<CreditCard> => {
      if (isAepbaseEnabled('credit-cards')) {
        const aepUserId = aepbase.getCurrentUser()?.id;
        return await aepbase.create<CreditCard>(AepCollections.CREDIT_CARDS, {
          ...data,
          archived: data.archived ?? false,
          created_by: aepUserId ? `users/${aepUserId}` : undefined,
        });
      }
      const pbUser = getCurrentUser();
      const rec = await getCollection<PbCreditCardRow>(Collections.CREDIT_CARDS).create({
        ...data,
        archived: data.archived ?? false,
        created_by: pbUser?.id,
      });
      return mapPbCreditCard(rec);
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
