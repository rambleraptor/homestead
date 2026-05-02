/**
 * Read all hands from localStorage, sorted newest-first.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { loadHands } from '../storage';
import type { Hand } from '../types';

export function useHands() {
  return useQuery({
    queryKey: queryKeys.module('bridge').list(),
    queryFn: async (): Promise<Hand[]> => {
      return loadHands().sort((a, b) => {
        const aKey = a.played_at || a.create_time || '';
        const bKey = b.played_at || b.create_time || '';
        return bKey.localeCompare(aKey);
      });
    },
  });
}
