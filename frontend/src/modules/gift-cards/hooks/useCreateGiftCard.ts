/**
 * Create Gift Card Mutation Hook
 *
 * Routes through aepbase or PB based on the gift-cards backend flag. The
 * FormData built by `buildGiftCardFormData` happens to use the same field
 * names as both backends' schemas, so a single FormData instance works in
 * both branches; only the `created_by` shape differs (PB wants a bare id,
 * aepbase wants `users/{id}`).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';
import { mapPbGiftCard } from './_mapPbRecords';

export function useCreateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GiftCardFormData): Promise<GiftCard> => {
      const useAep = isAepbaseEnabled('gift-cards');
      const aepUserId = aepbase.getCurrentUser()?.id;
      const pbUserId = getCurrentUser()?.id;
      const createdBy = useAep
        ? aepUserId
          ? `users/${aepUserId}`
          : undefined
        : pbUserId;

      try {
        const hasFiles = data.front_image || data.back_image;

        if (useAep) {
          if (hasFiles) {
            const formData = buildGiftCardFormData({ data, createdBy });
            return await aepbase.create<GiftCard>(AepCollections.GIFT_CARDS, formData);
          }
          const cardData = buildGiftCardData({ data, createdBy });
          return await aepbase.create<GiftCard>(AepCollections.GIFT_CARDS, cardData);
        }

        // PocketBase path.
        if (hasFiles) {
          const formData = buildGiftCardFormData({ data, createdBy });
          const rec = await getCollection<Parameters<typeof mapPbGiftCard>[0]>(
            Collections.GIFT_CARDS,
          ).create(formData);
          return mapPbGiftCard(rec);
        }
        const cardData = buildGiftCardData({ data, createdBy });
        const rec = await getCollection<Parameters<typeof mapPbGiftCard>[0]>(
          Collections.GIFT_CARDS,
        ).create(cardData);
        return mapPbGiftCard(rec);
      } catch (error) {
        logger.error('Failed to create gift card', error, {
          giftCardData: data,
          aepbaseUser: aepbase.getCurrentUser(),
          pocketbaseUser: getCurrentUser(),
        });
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
    },
    onError: (error) => {
      logger.error('Gift card creation mutation error', error);
    },
  });
}
