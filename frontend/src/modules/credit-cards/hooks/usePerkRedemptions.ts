/**
 * Perk Redemptions Query Hook
 *
 * Fetches all perk redemptions from PocketBase
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { PerkRedemption } from '../types';

export function usePerkRedemptions() {
  return useQuery({
    queryKey: queryKeys.module('credit-cards').list({ type: 'redemptions' }),
    queryFn: async () => {
      const redemptions = await getCollection<PerkRedemption>(Collections.PERK_REDEMPTIONS).getFullList({
        sort: '-redeemed_at',
      });
      return redemptions;
    },
  });
}
