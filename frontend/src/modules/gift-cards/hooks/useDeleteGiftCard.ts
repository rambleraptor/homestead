/**
 * Delete Gift Card Mutation Hook
 * Cascade-deletes child transactions.
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepRemove } from '@/core/api/resourceHooks';

export function useDeleteGiftCard() {
  return useAepRemove(AepCollections.GIFT_CARDS, { moduleId: 'gift-cards' });
}
