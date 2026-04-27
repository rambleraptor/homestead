/**
 * Delete Credit Card Mutation Hook. Cascade-deletes child perks + redemptions.
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepRemove } from '@/core/api/resourceHooks';

export function useDeleteCreditCard() {
  return useAepRemove(AepCollections.CREDIT_CARDS, { moduleId: 'credit-cards' });
}
