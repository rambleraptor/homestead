/**
 * The "All perks used" moment.
 *
 * Returns a function to call once a redemption has been recorded. Given the
 * redemptions as they stood *before* the write and the one just added, it
 * celebrates only when that redemption is the one that completed the card —
 * a card that was already complete, or still isn't, stays quiet. That is what
 * keeps the toast to once per action: it fires on the transition, never on a
 * state.
 */

import { useCallback } from 'react';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { allPerksRedeemed, type RedemptionLike } from '../utils/cardCompletion';
import type { CreditCard, CreditCardPerk } from '../types';

export function usePerkCelebration() {
  const toast = useToast();
  return useCallback(
    (
      card: CreditCard,
      perks: CreditCardPerk[],
      before: RedemptionLike[],
      added: RedemptionLike,
    ) => {
      if (allPerksRedeemed(card, perks, before)) return;
      if (!allPerksRedeemed(card, perks, [...before, added])) return;
      toast.celebrate('All perks used', {
        description: `${card.name} — nothing left on the table`,
      });
    },
    [toast],
  );
}
