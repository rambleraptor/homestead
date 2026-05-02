/**
 * Update Perk Mutation Hook.
 * Parent credit-card id is recovered from the React Query cache.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { CreditCardPerk, PerkFormData } from '../types';
import { findPerkParentCardId } from './_aepLookup';

interface UpdatePerkParams {
  id: string;
  data: Partial<PerkFormData>;
}

export function useUpdatePerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdatePerkParams): Promise<CreditCardPerk> => {
      const cardId = findPerkParentCardId(queryClient, id);
      const { credit_card: _ignore, ...body } = data;
      const updated = await aepbase.update<CreditCardPerk>(
        AepCollections.CREDIT_CARD_PERKS,
        id,
        body,
        { parent: [AepCollections.CREDIT_CARDS, cardId] },
      );
      return { ...updated, credit_card: cardId };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('credit-cards').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('credit-cards').all() });
      logger.info('Perk updated successfully');
    },
    onError: (error) => logger.error('Failed to update perk', error),
  });
}
