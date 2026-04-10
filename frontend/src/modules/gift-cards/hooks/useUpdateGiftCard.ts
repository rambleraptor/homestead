/**
 * Update Gift Card Mutation Hook
 *
 * Routes through aepbase or PB based on the gift-cards backend flag. The
 * `amount === 0 → delete card` shortcut is preserved on both branches.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';
import { mapPbGiftCard } from './_mapPbRecords';

export function useUpdateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: GiftCardFormData;
    }): Promise<GiftCard | null> => {
      const useAep = isAepbaseEnabled('gift-cards');
      logger.debug('Gift card update mutation called', { id, data, backend: useAep ? 'aepbase' : 'pb' });

      // Delete gift card if amount is 0 (matches the previous shortcut).
      if (data.amount === 0) {
        if (useAep) {
          await aepbase.remove(AepCollections.GIFT_CARDS, id);
        } else {
          await getCollection(Collections.GIFT_CARDS).delete(id);
        }
        return null;
      }

      const archived = data.amount === 0;
      const hasFiles = data.front_image || data.back_image;

      if (useAep) {
        if (hasFiles) {
          const formData = buildGiftCardFormData({ data, archived });
          return await aepbase.update<GiftCard>(AepCollections.GIFT_CARDS, id, formData);
        }
        const updateData = buildGiftCardData({ data, archived });
        return await aepbase.update<GiftCard>(AepCollections.GIFT_CARDS, id, updateData);
      }

      // PocketBase path.
      if (hasFiles) {
        const formData = buildGiftCardFormData({ data, archived });
        const rec = await getCollection<Parameters<typeof mapPbGiftCard>[0]>(
          Collections.GIFT_CARDS,
        ).update(id, formData);
        return mapPbGiftCard(rec);
      }
      const updateData = buildGiftCardData({ data, archived });
      const rec = await getCollection<Parameters<typeof mapPbGiftCard>[0]>(
        Collections.GIFT_CARDS,
      ).update(id, updateData);
      return mapPbGiftCard(rec);
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
