/**
 * Create Perk Mutation Hook — branches on the `credit-cards` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { CreditCardPerk, PerkFormData } from '../types';
import { mapPbPerk, type PbPerkRow } from './_mapPbRecords';

export function useCreatePerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PerkFormData): Promise<CreditCardPerk> => {
      if (isAepbaseEnabled('credit-cards')) {
        const aepUserId = aepbase.getCurrentUser()?.id;
        const { credit_card, ...body } = data;
        const created = await aepbase.create<CreditCardPerk>(
          AepCollections.CREDIT_CARD_PERKS,
          {
            ...body,
            created_by: aepUserId ? `users/${aepUserId}` : undefined,
          },
          { parent: [AepCollections.CREDIT_CARDS, credit_card] },
        );
        return { ...created, credit_card };
      }
      const pbUser = getCurrentUser();
      const rec = await getCollection<PbPerkRow>(Collections.CREDIT_CARD_PERKS).create({
        ...data,
        created_by: pbUser?.id,
      });
      return mapPbPerk(rec);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('credit-cards').all(),
      });
      logger.info('Perk created successfully');
    },
    onError: (error) => {
      logger.error('Failed to create perk', error);
    },
  });
}
