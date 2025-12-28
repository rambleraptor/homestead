/**
 * Create Gift Card Mutation Hook
 *
 * Creates a new gift card in PocketBase
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

export function useCreateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GiftCardFormData) => {
      try {
        const currentUser = getCurrentUser();

        // Use FormData if files are present
        const hasFiles = data.front_image || data.back_image;

        if (hasFiles) {
          const formData = buildGiftCardFormData({
            data,
            createdBy: currentUser?.id,
          });
          return await getCollection<GiftCard>(Collections.GIFT_CARDS).create(formData);
        } else {
          const cardData = buildGiftCardData({
            data,
            createdBy: currentUser?.id,
          });
          return await getCollection<GiftCard>(Collections.GIFT_CARDS).create(cardData);
        }
      } catch (error) {
        logger.error('Failed to create gift card', error, {
          giftCardData: data,
          currentUser: getCurrentUser()
        });
        throw error;
      }
    },
    onSuccess: async () => {
      // Invalidate and refetch gift cards queries
      // invalidateQueries marks as stale, refetchQueries triggers immediate refetch
      // Both together ensure data is fresh before mutation resolves
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
