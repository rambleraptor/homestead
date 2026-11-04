/**
 * Whether a card has nothing left on the table: every one of its perks is
 * fully redeemed for its current period. A card with no perks is never
 * "complete" — there was nothing to use.
 */

import {
  getCurrentPeriod,
  getRedemptionStatus,
  sumRedeemedForPeriod,
} from './periodUtils';
import type { CreditCard, CreditCardPerk, PerkRedemption } from '../types';

/** The fields of a redemption the completion check reads. */
export type RedemptionLike = Pick<PerkRedemption, 'perk' | 'period_start' | 'period_end' | 'amount'>;

export function allPerksRedeemed(
  card: CreditCard,
  perks: CreditCardPerk[],
  redemptions: RedemptionLike[],
): boolean {
  const cardPerks = perks.filter((p) => p.credit_card === card.id);
  if (cardPerks.length === 0) return false;
  return cardPerks.every((perk) => {
    const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);
    const redeemed = sumRedeemedForPeriod(redemptions as PerkRedemption[], perk.id, period);
    return getRedemptionStatus(redeemed, perk.value) === 'full';
  });
}
