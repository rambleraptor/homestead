/**
 * Credit Cards Query Hook.
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepList } from '@/core/api/resourceHooks';
import type { CreditCard } from '../types';

export function useCreditCards() {
  return useAepList<CreditCard>(AepCollections.CREDIT_CARDS, {
    moduleId: 'credit-cards',
    sort: (a, b) => (b.create_time || '').localeCompare(a.create_time || ''),
  });
}
