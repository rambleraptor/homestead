/**
 * Create Credit Card Mutation Hook.
 *
 * Thin shell over the generic offline mutation factory. The mutationFn,
 * optimistic update, and rollback all live on the QueryClient via
 * `registerResourceMutationDefaults` (auto-registered for every module
 * resource at app boot). Offline writes pause and replay across reloads
 * without per-hook scaffolding.
 */

import { useResourceCreate } from '@rambleraptor/homestead-core/api/resourceHooks';
import type { CreditCard, CreditCardFormData } from '../types';

export function useCreateCreditCard() {
  return useResourceCreate<CreditCard, CreditCardFormData>(
    'credit-cards',
    'credit-card',
  );
}
