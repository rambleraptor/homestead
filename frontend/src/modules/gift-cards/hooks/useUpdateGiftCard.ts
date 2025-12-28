/**
 * Update Gift Card Mutation Hook
 *
 * Updates an existing gift card in PocketBase
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

export function useUpdateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: GiftCardFormData }) => {
      logger.debug('Gift card update mutation called', { id, data });
      // Automatically archive if amount is 0
      const archived = data.amount === 0;

      // Use FormData if files are present
      const hasFiles = data.front_image || data.back_image;

      if (hasFiles) {
        logger.debug('Using FormData for gift card update (has files)', { id });
        const formData = buildGiftCardFormData({
          data,
          archived,
        });
        const result = await getCollection<GiftCard>(Collections.GIFT_CARDS).update(id, formData);
        logger.debug('Gift card update successful (FormData)', { id, result });

        // VERIFY: Fetch from database to confirm
        const verified = await getCollection<GiftCard>(Collections.GIFT_CARDS).getOne(id);
        logger.debug('Database verification (FormData)', { id, verified });

        return result;
      } else {
        logger.debug('Using plain object for gift card update (no files)', { id });
        const updateData = buildGiftCardData({
          data,
          archived,
        });
        logger.debug('Gift card update data prepared', { id, updateData });
        const result = await getCollection<GiftCard>(Collections.GIFT_CARDS).update(id, updateData);
        logger.debug('Gift card update successful (plain object)', { id, result });

        // VERIFY: Fetch from database to confirm
        const verified = await getCollection<GiftCard>(Collections.GIFT_CARDS).getOne(id);
        logger.debug('Database verification (plain object)', { id, verified });

        return result;
      }
    },
    onSuccess: async () => {
      logger.debug('Gift card update successful, refetching queries');
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
      logger.error('Gift card update mutation error', error);
    },
  });
}
