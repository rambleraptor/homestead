/**
 * Create Gift Card Mutation Hook
 *
 * Creates a new gift card in PocketBase
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

export function useCreateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GiftCardFormData) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
    },
  });
}
