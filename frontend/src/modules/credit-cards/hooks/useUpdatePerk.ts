/**
 * Update Perk Mutation Hook.
 * Parent credit-card id is recovered from the React Query cache.
 */

import { useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { useAepUpdate } from '@/core/api/resourceHooks';
import type { CreditCardPerk, PerkFormData } from '../types';
import { findPerkParentCardId } from './_aepLookup';

interface UpdatePerkParams {
  id: string;
  data: Partial<PerkFormData>;
}

export function useUpdatePerk() {
  const queryClient = useQueryClient();
  return useAepUpdate<CreditCardPerk, UpdatePerkParams>(
    AepCollections.CREDIT_CARD_PERKS,
    {
      moduleId: 'credit-cards',
      mutationFn: async ({ id, data }) => {
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
    },
  );
}
