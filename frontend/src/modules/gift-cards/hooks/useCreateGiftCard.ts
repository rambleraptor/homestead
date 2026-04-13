/**
 * Create Gift Card Mutation Hook
 *
 * Multipart POST when images are present so aepbase's file-field handler
 * picks them up. `created_by` is the aepbase resource path `users/{id}`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

export function useCreateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GiftCardFormData): Promise<GiftCard> => {
      try {
        const createdBy = createdByPath();
        const hasFiles = data.front_image || data.back_image;
        if (hasFiles) {
          const formData = buildGiftCardFormData({ data, createdBy });
          return await aepbase.create<GiftCard>(AepCollections.GIFT_CARDS, formData);
        }
        const cardData = buildGiftCardData({ data, createdBy });
        return await aepbase.create<GiftCard>(AepCollections.GIFT_CARDS, cardData);
      } catch (error) {
        logger.error('Failed to create gift card', error, {
          giftCardData: data,
          currentUser: aepbase.getCurrentUser(),
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
