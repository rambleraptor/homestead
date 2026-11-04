/**
 * Single Gift Card Query Hook — the edit form at `/gift-cards/cards/:id/edit`
 * reads the card by id so the page survives a reload. Keyed on the detail
 * slot the mutation factory keeps in step with the list.
 */

import { useResourceItem } from '@rambleraptor/homestead-core/api/resourceHooks';
import { GIFT_CARDS } from '../resources';
import type { GiftCard } from '../types';

export function useGiftCard(id: string | null) {
  return useResourceItem<GiftCard>('gift-cards', 'gift-card', GIFT_CARDS, id);
}
