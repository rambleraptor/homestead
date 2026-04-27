/**
 * Gift Cards Query Hook
 *
 * aepbase has no `sort` query param, so we order client-side by
 * `create_time` desc (newest first).
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepList } from '@/core/api/resourceHooks';
import type { GiftCard } from '../types';

export function useGiftCards() {
  return useAepList<GiftCard>(AepCollections.GIFT_CARDS, {
    moduleId: 'gift-cards',
    sort: (a, b) => (b.create_time || '').localeCompare(a.create_time || ''),
  });
}
