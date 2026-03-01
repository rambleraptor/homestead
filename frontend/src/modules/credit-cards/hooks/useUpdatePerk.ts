/**
 * Update Perk Mutation Hook
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { CreditCardPerk, PerkFormData } from '../types';

interface UpdatePerkParams {
  id: string;
  data: Partial<PerkFormData>;
}

export function useUpdatePerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdatePerkParams) => {
      return await getCollection<CreditCardPerk>(Collections.CREDIT_CARD_PERKS).update(id, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Perk updated successfully');
    },
    onError: (error) => {
      logger.error('Failed to update perk', error);
    },
  });
}
