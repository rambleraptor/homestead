/**
 * Update Gift Card Mutation Hook
 *
 * File fields go over multipart; plain updates use merge-patch JSON.
 * The amount-zero shortcut deletes the card outright (and returns null).
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { useAepUpdate } from '@/core/api/resourceHooks';
import { logger } from '@/core/utils/logger';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

interface UpdateGiftCardVars {
  id: string;
  data: GiftCardFormData;
}

export function useUpdateGiftCard() {
  return useAepUpdate<GiftCard | null, UpdateGiftCardVars>(
    AepCollections.GIFT_CARDS,
    {
      moduleId: 'gift-cards',
      mutationFn: async ({ id, data }) => {
        logger.debug('Gift card update mutation called', { id, data });
        if (data.amount === 0) {
          await aepbase.remove(AepCollections.GIFT_CARDS, id);
          return null;
        }
        const archived = data.amount === 0;
        const hasFiles = data.front_image || data.back_image;
        if (hasFiles) {
          const formData = buildGiftCardFormData({ data, archived });
          return aepbase.update<GiftCard>(AepCollections.GIFT_CARDS, id, formData);
        }
        return aepbase.update<GiftCard>(
          AepCollections.GIFT_CARDS,
          id,
          buildGiftCardData({ data, archived }),
        );
      },
    },
  );
}
