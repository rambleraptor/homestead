/**
 * Create Redemption Mutation Hook — branches on the `credit-cards` flag.
 *
 * Unlike `useRedeemPerk` (which auto-calculates the current period), this
 * hook accepts explicit period dates for historical entries. The form data
 * carries `perk` (perk id); in aepbase mode we look up the parent credit
 * card via the cached perks list.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { PerkRedemption, RedemptionFormData } from '../types';
import { mapPbRedemption, type PbRedemptionRow } from './_mapPbRecords';
import { findPerkParentCardId } from './_aepLookup';

export function useCreateRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RedemptionFormData): Promise<PerkRedemption> => {
      if (isAepbaseEnabled('credit-cards')) {
        const aepUserId = aepbase.getCurrentUser()?.id;
        const cardId = findPerkParentCardId(queryClient, data.perk);
        const { perk: perkId, ...body } = data;
        const created = await aepbase.create<PerkRedemption>(
          AepCollections.PERK_REDEMPTIONS,
          {
            ...body,
            created_by: aepUserId ? `users/${aepUserId}` : undefined,
          },
          {
            parent: [
              AepCollections.CREDIT_CARDS,
              cardId,
              AepCollections.CREDIT_CARD_PERKS,
              perkId,
            ],
          },
        );
        return { ...created, perk: perkId };
      }

      const pbUser = getCurrentUser();
      const rec = await getCollection<PbRedemptionRow>(
        Collections.PERK_REDEMPTIONS,
      ).create({ ...data, created_by: pbUser?.id });
      return mapPbRedemption(rec);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Redemption created successfully');
    },
    onError: (error) => {
      logger.error('Failed to create redemption', error);
    },
  });
}
