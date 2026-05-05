/**
 * Update Credit Card Mutation Hook. See `useCreateCreditCard.ts`.
 */

import { useResourceUpdate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { CreditCard, CreditCardFormData } from '../types';

export function useUpdateCreditCard() {
  return useResourceUpdate<CreditCard, Partial<CreditCardFormData>>(
    'credit-cards',
    'credit-card',
  );
}
