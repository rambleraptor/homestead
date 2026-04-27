/**
 * Create Credit Card Mutation Hook.
 */

import { AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import type { CreditCard, CreditCardFormData } from '../types';

export function useCreateCreditCard() {
  return useAepCreate<CreditCard, CreditCardFormData>(
    AepCollections.CREDIT_CARDS,
    {
      moduleId: 'credit-cards',
      transform: (data) => ({
        ...data,
        archived: data.archived ?? false,
        created_by: currentUserPath(),
      }),
    },
  );
}
