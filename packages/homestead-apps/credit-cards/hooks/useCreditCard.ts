/**
 * Single Credit Card Query Hook.
 *
 * Reads `queryKeys.app('credit-cards').resource('credit-card').detail(id)` —
 * the slot the mutation factory keeps in step with the list, so a card just
 * created (online or queued offline) opens at its own address at once.
 */

import { useResourceItem } from '@rambleraptor/homestead-core/api/resourceHooks';
import { CREDIT_CARDS } from '../resources';
import type { CreditCard } from '../types';

export function useCreditCard(id: string | null) {
  return useResourceItem<CreditCard>('credit-cards', 'credit-card', CREDIT_CARDS, id);
}
