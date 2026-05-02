/**
 * Lookups for nested-resource parent ids in aepbase mode.
 *
 * Mutations on perks/redemptions only know the resource id, but aepbase
 * needs the full URL path (`/credit-cards/{cid}/perks/{pid}` and
 * `/credit-cards/{cid}/perks/{pid}/redemptions/{rid}`). The list query hooks
 * stash full perks/redemptions in the React Query cache via
 * `mapPbPerk`/`mapPbRedemption`/the aepbase parent injection, which means we
 * can recover the parent ids from the cache without an extra round-trip.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { CreditCardPerk, PerkRedemption } from '../types';

export function findPerkParentCardId(
  queryClient: QueryClient,
  perkId: string,
): string {
  const perks = queryClient.getQueryData<CreditCardPerk[]>(
    queryKeys.module('credit-cards').list({ type: 'perks' }),
  );
  const perk = perks?.find((p) => p.id === perkId);
  if (!perk) {
    throw new Error(
      `perk ${perkId} not in cache; the perks query must run before mutating`,
    );
  }
  return perk.credit_card;
}

export function findRedemptionParents(
  queryClient: QueryClient,
  redemptionId: string,
): { creditCardId: string; perkId: string } {
  const redemptions = queryClient.getQueryData<PerkRedemption[]>(
    queryKeys.module('credit-cards').list({ type: 'redemptions' }),
  );
  const redemption = redemptions?.find((r) => r.id === redemptionId);
  if (!redemption) {
    throw new Error(
      `redemption ${redemptionId} not in cache; the redemptions query must run before mutating`,
    );
  }
  return {
    creditCardId: findPerkParentCardId(queryClient, redemption.perk),
    perkId: redemption.perk,
  };
}
