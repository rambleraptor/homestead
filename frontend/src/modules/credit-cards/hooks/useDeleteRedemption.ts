/**
 * Delete Redemption Mutation Hook.
 */

import { useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { useAepRemove } from '@/core/api/resourceHooks';
import { findRedemptionParents } from './_aepLookup';

export function useDeleteRedemption() {
  const queryClient = useQueryClient();
  return useAepRemove<string>(AepCollections.PERK_REDEMPTIONS, {
    moduleId: 'credit-cards',
    mutationFn: async (id) => {
      const { creditCardId, perkId } = findRedemptionParents(queryClient, id);
      await aepbase.remove(AepCollections.PERK_REDEMPTIONS, id, {
        parent: [
          AepCollections.CREDIT_CARDS, creditCardId,
          AepCollections.CREDIT_CARD_PERKS, perkId,
        ],
      });
    },
  });
}
