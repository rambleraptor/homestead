/**
 * Delete Credit Card Mutation Hook. See `useCreateCreditCard.ts`.
 *
 * Cascade-deletion of child perks + redemptions on the server is handled
 * by aepbase. This mutation only removes the parent card from the local
 * cache and the network — the next reconcile picks up server-side cleanup.
 */

import { useResourceDelete } from '@rambleraptor/homestead-core/api/resourceHooks';

export function useDeleteCreditCard() {
  return useResourceDelete('credit-cards', 'credit-card');
}
