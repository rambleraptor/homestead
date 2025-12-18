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
      console.log('[useUpdateGiftCard] mutationFn called with:', { id, data });
      // Automatically archive if amount is 0
      const archived = data.amount === 0;

      // Use FormData if files are present
      const hasFiles = data.front_image || data.back_image;

      if (hasFiles) {
        console.log('[useUpdateGiftCard] Using FormData (has files)');
        const formData = buildGiftCardFormData({
          data,
          archived,
        });
        const result = await getCollection<GiftCard>(Collections.GIFT_CARDS).update(id, formData);
        console.log('[useUpdateGiftCard] Update successful (FormData):', result);

        // VERIFY: Fetch from database to confirm
        const verified = await getCollection<GiftCard>(Collections.GIFT_CARDS).getOne(id);
        console.log('[useUpdateGiftCard] Database verification (FormData):', verified);

        return result;
      } else {
        console.log('[useUpdateGiftCard] Using plain object (no files)');
        const updateData = buildGiftCardData({
          data,
          archived,
        });
        console.log('[useUpdateGiftCard] updateData:', updateData);
        const result = await getCollection<GiftCard>(Collections.GIFT_CARDS).update(id, updateData);
        console.log('[useUpdateGiftCard] Update successful (plain object):', result);

        // VERIFY: Fetch from database to confirm
        const verified = await getCollection<GiftCard>(Collections.GIFT_CARDS).getOne(id);
        console.log('[useUpdateGiftCard] Database verification (plain object):', verified);

        return result;
      }
    },
    onSuccess: () => {
      console.log('[useUpdateGiftCard] onSuccess called, invalidating queries');
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
    },
    onError: (error) => {
      console.error('[useUpdateGiftCard] onError called:', error);
    },
  });
}
