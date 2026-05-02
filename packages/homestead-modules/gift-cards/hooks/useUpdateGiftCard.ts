/**
 * Update Gift Card Mutation Hook
 *
 * File fields go over multipart; plain updates use merge-patch JSON.
 * The amount-zero shortcut deletes the card outright.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

export function useUpdateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: GiftCardFormData }): Promise<GiftCard | null> => {
      logger.debug('Gift card update mutation called', { id, data });

      if (data.amount === 0) {
        await aepbase.remove(AepCollections.GIFT_CARDS, id);
        return null;
      }

      const archived = data.amount === 0;
      const hasFiles = data.front_image || data.back_image;

      if (hasFiles) {
        const formData = buildGiftCardFormData({ data, archived });
        return await aepbase.update<GiftCard>(AepCollections.GIFT_CARDS, id, formData);
      }
      const updateData = buildGiftCardData({ data, archived });
      return await aepbase.update<GiftCard>(AepCollections.GIFT_CARDS, id, updateData);
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
      logger.error('Gift card update mutation error', error);
    },
  });
}
