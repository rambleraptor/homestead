/**
 * Update Redemption Mutation Hook — branches on the `credit-cards` flag.
 * Parent ids (credit card + perk) are recovered from the cached redemptions
 * list in aepbase mode.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { PerkRedemption, RedemptionFormData } from '../types';
import { mapPbRedemption, type PbRedemptionRow } from './_mapPbRecords';
import { findRedemptionParents } from './_aepLookup';

interface UpdateRedemptionParams {
  id: string;
  data: Partial<RedemptionFormData>;
}

export function useUpdateRedemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: UpdateRedemptionParams): Promise<PerkRedemption> => {
      if (isAepbaseEnabled('credit-cards')) {
        const { creditCardId, perkId } = findRedemptionParents(queryClient, id);
        const { perk: _ignore, ...body } = data;
        const updated = await aepbase.update<PerkRedemption>(
          AepCollections.PERK_REDEMPTIONS,
          id,
          body,
          {
            parent: [
              AepCollections.CREDIT_CARDS,
              creditCardId,
              AepCollections.CREDIT_CARD_PERKS,
              perkId,
            ],
          },
        );
        return { ...updated, perk: perkId };
      }
      const rec = await getCollection<PbRedemptionRow>(
        Collections.PERK_REDEMPTIONS,
      ).update(id, data);
      return mapPbRedemption(rec);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Redemption updated successfully');
    },
    onError: (error) => {
      logger.error('Failed to update redemption', error);
    },
  });
}
