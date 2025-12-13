/**
 * Update Gift Card Mutation Hook
 *
 * Updates an existing gift card in PocketBase
 */

import { useMutation } from '@tanstack/react-query';
import { queryClient, queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { GiftCard, GiftCardFormData } from '../types';

export function useUpdateGiftCard() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: GiftCardFormData }) => {
      // Automatically archive if amount is 0
      const updateData = {
        ...data,
        archived: data.amount === 0,
      };
      return await getCollection<GiftCard>(Collections.GIFT_CARDS).update(id, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
    },
  });
}
