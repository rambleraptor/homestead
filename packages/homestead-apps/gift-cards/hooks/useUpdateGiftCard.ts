/**
 * Update Gift Card Mutation Hook
 *
 * File fields go over multipart; plain updates use merge-patch JSON.
 * The amount-zero shortcut deletes the card outright.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { GIFT_CARDS } from '../resources';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

export function useUpdateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: GiftCardFormData }): Promise<GiftCard | null> => {
      logger.debug('Gift card update mutation called', { id, data });

      if (data.amount === 0) {
        // The card may have transaction children; force-cascade the delete.
        await aepbase.remove(GIFT_CARDS, id, { force: true });
        return null;
      }

      const archived = data.amount === 0;
      const hasFiles = data.front_image || data.back_image;

      if (hasFiles) {
        const formData = buildGiftCardFormData({ data, archived });
        return await aepbase.update<GiftCard>(GIFT_CARDS, id, formData);
      }
      const updateData = buildGiftCardData({ data, archived });
      return await aepbase.update<GiftCard>(GIFT_CARDS, id, updateData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('gift-cards').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.app('gift-cards').all(),
      });
    },
  });
}
