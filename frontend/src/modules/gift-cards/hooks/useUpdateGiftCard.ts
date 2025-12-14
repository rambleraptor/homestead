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
      const archived = data.amount === 0;

      // Use FormData if files are present
      const hasFiles = data.front_image || data.back_image;

      if (hasFiles) {
        const formData = new FormData();
        formData.append('merchant', data.merchant);
        formData.append('card_number', data.card_number);
        if (data.pin) formData.append('pin', data.pin);
        formData.append('amount', data.amount.toString());
        if (data.notes) formData.append('notes', data.notes);
        formData.append('archived', archived.toString());

        if (data.front_image) {
          formData.append('front_image', data.front_image);
        }
        if (data.back_image) {
          formData.append('back_image', data.back_image);
        }

        return await getCollection<GiftCard>(Collections.GIFT_CARDS).update(id, formData);
      } else {
        const updateData = {
          merchant: data.merchant,
          card_number: data.card_number,
          pin: data.pin,
          amount: data.amount,
          notes: data.notes,
          archived,
        };
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
