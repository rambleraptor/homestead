/**
 * Create Gift Card Mutation Hook
 *
 * Creates a new gift card in PocketBase
 */

import { useMutation } from '@tanstack/react-query';
import { queryClient, queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import type { GiftCard, GiftCardFormData } from '../types';

export function useCreateGiftCard() {
  return useMutation({
    mutationFn: async (data: GiftCardFormData) => {
      const currentUser = getCurrentUser();

      // Use FormData if files are present
      const hasFiles = data.front_image || data.back_image;

      if (hasFiles) {
        const formData = new FormData();
        formData.append('merchant', data.merchant);
        formData.append('card_number', data.card_number);
        if (data.pin) formData.append('pin', data.pin);
        formData.append('amount', data.amount.toString());
        if (data.notes) formData.append('notes', data.notes);
        if (currentUser?.id) formData.append('created_by', currentUser.id);

        if (data.front_image) {
          formData.append('front_image', data.front_image);
        }
        if (data.back_image) {
          formData.append('back_image', data.back_image);
        }

        return await getCollection<GiftCard>(Collections.GIFT_CARDS).create(formData);
      } else {
        const cardData = {
          merchant: data.merchant,
          card_number: data.card_number,
          pin: data.pin,
          amount: data.amount,
          notes: data.notes,
          created_by: currentUser?.id,
        };

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
