/**
 * Create Redemption Mutation Hook.
 *
 * Unlike `useRedeemPerk` this accepts explicit period dates for historical
 * entries. The parent card id is recovered from the cached perks list.
 */

import { useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import type { PerkRedemption, RedemptionFormData } from '../types';
import { findPerkParentCardId } from './_aepLookup';

export function useCreateRedemption() {
  const queryClient = useQueryClient();
  return useAepCreate<PerkRedemption, RedemptionFormData>(
    AepCollections.PERK_REDEMPTIONS,
    {
      moduleId: 'credit-cards',
      mutationFn: async (data) => {
        const cardId = findPerkParentCardId(queryClient, data.perk);
        const { perk: perkId, ...body } = data;
        const created = await aepbase.create<PerkRedemption>(
          AepCollections.PERK_REDEMPTIONS,
          { ...body, created_by: currentUserPath() },
          {
            parent: [
              AepCollections.CREDIT_CARDS, cardId,
              AepCollections.CREDIT_CARD_PERKS, perkId,
            ],
          },
        );
        return { ...created, perk: perkId };
      },
    },
  );
}
