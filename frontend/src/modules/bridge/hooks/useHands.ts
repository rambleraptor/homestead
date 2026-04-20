/**
 * Hands list hook. aepbase has no sort param so we order client-side by
 * played_at (then create_time) desc — newest first.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { Hand } from '../types';

export function useHands() {
  return useQuery({
    queryKey: queryKeys.module('bridge').list(),
    queryFn: async (): Promise<Hand[]> => {
      const hands = await aepbase.list<Hand>(AepCollections.BRIDGE_HANDS);
      return hands.sort((a, b) => {
        const aKey = a.played_at || a.create_time || '';
        const bKey = b.played_at || b.create_time || '';
        return bKey.localeCompare(aKey);
      });
    },
  });
}
