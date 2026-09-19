import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { GIFT_CARDS } from '../resources';
import type { GiftCard, GiftCardFormData } from '../types';
import { buildGiftCardFormData, buildGiftCardData } from '../utils/formData';

export function useCreateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GiftCardFormData): Promise<GiftCard> => {
      const userId = aepbase.getCurrentUser()?.id;
      const createdBy = userId ? `users/${userId}` : undefined;
      const hasFiles = data.front_image || data.back_image;

      // Multipart POST when images are present so aepbase's file-field handler
      // picks them up.
      const payload = hasFiles
        ? buildGiftCardFormData({ data, createdBy })
        : buildGiftCardData({ data, createdBy });
      return aepbase.create<GiftCard>(GIFT_CARDS, payload);
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
