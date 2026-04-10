/**
 * Update Perk Mutation Hook — branches on the `credit-cards` flag.
 *
 * In aepbase mode the parent credit-card id is recovered from the React
 * Query cache (set by `useCreditCardPerks`'s mapper) so the call site doesn't
 * need to pass it explicitly.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { CreditCardPerk, PerkFormData } from '../types';
import { mapPbPerk, type PbPerkRow } from './_mapPbRecords';
import { findPerkParentCardId } from './_aepLookup';

interface UpdatePerkParams {
  id: string;
  data: Partial<PerkFormData>;
}

export function useUpdatePerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdatePerkParams): Promise<CreditCardPerk> => {
      if (isAepbaseEnabled('credit-cards')) {
        const cardId = findPerkParentCardId(queryClient, id);
        const { credit_card: _ignore, ...body } = data;
        const updated = await aepbase.update<CreditCardPerk>(
          AepCollections.CREDIT_CARD_PERKS,
          id,
          body,
          { parent: [AepCollections.CREDIT_CARDS, cardId] },
        );
        return { ...updated, credit_card: cardId };
      }
      const rec = await getCollection<PbPerkRow>(
        Collections.CREDIT_CARD_PERKS,
      ).update(id, data);
      return mapPbPerk(rec);
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
