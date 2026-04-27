/**
 * Update Credit Card Mutation Hook.
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepUpdate } from '@/core/api/resourceHooks';
import type { CreditCard, CreditCardFormData } from '../types';

interface UpdateCreditCardParams {
  id: string;
  data: Partial<CreditCardFormData>;
}

export function useUpdateCreditCard() {
  return useAepUpdate<CreditCard, UpdateCreditCardParams>(
    AepCollections.CREDIT_CARDS,
    { moduleId: 'credit-cards' },
  );
}
