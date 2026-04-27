/**
 * Delete Perk Mutation Hook.
 */

import { useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { useAepRemove } from '@/core/api/resourceHooks';
import { findPerkParentCardId } from './_aepLookup';

export function useDeletePerk() {
  const queryClient = useQueryClient();
  return useAepRemove<string>(AepCollections.CREDIT_CARD_PERKS, {
    moduleId: 'credit-cards',
    mutationFn: async (id) => {
      const cardId = findPerkParentCardId(queryClient, id);
      await aepbase.remove(AepCollections.CREDIT_CARD_PERKS, id, {
        parent: [AepCollections.CREDIT_CARDS, cardId],
      });
    },
  });
}
