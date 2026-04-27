/**
 * Update Redemption Mutation Hook.
 */

import { useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { useAepUpdate } from '@/core/api/resourceHooks';
import type { PerkRedemption, RedemptionFormData } from '../types';
import { findRedemptionParents } from './_aepLookup';

interface UpdateRedemptionParams {
  id: string;
  data: Partial<RedemptionFormData>;
}

export function useUpdateRedemption() {
  const queryClient = useQueryClient();
  return useAepUpdate<PerkRedemption, UpdateRedemptionParams>(
    AepCollections.PERK_REDEMPTIONS,
    {
      moduleId: 'credit-cards',
      mutationFn: async ({ id, data }) => {
        const { creditCardId, perkId } = findRedemptionParents(queryClient, id);
        const { perk: _ignore, ...body } = data;
        const updated = await aepbase.update<PerkRedemption>(
          AepCollections.PERK_REDEMPTIONS,
          id,
          body,
          {
            parent: [
              AepCollections.CREDIT_CARDS, creditCardId,
              AepCollections.CREDIT_CARD_PERKS, perkId,
            ],
          },
        );
        return { ...updated, perk: perkId };
      },
    },
  );
}
