/**
 * Update Gift Card Mutation Hook
 *
 * Updates an existing gift card in PocketBase
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

export function useUpdateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: GiftCardFormData }) => {
      // Automatically archive if amount is 0
      const archived = data.amount === 0;

      // Use FormData if files are present
      const hasFiles = data.front_image || data.back_image;

      if (hasFiles) {
        const formData = buildGiftCardFormData({
          data,
          archived,
        });
        return await getCollection<GiftCard>(Collections.GIFT_CARDS).update(id, formData);
      } else {
        const updateData = buildGiftCardData({
          data,
          archived,
        });
        return await getCollection<GiftCard>(Collections.GIFT_CARDS).update(id, updateData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
    },
  });
}
