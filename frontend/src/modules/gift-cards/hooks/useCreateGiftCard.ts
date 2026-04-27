import { AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

export function useCreateGiftCard() {
  return useAepCreate<GiftCard, GiftCardFormData>(AepCollections.GIFT_CARDS, {
    moduleId: 'gift-cards',
    transform: (data) => {
      const createdBy = currentUserPath();
      const hasFiles = data.front_image || data.back_image;
      // Multipart POST when images are present so aepbase's file-field handler
      // picks them up.
      return hasFiles
        ? buildGiftCardFormData({ data, createdBy })
        : buildGiftCardData({ data, createdBy });
    },
  });
}
