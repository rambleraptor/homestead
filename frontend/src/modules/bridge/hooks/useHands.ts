/**
 * Read all hands from localStorage, sorted newest-first.
 */

import { useAepList } from '@/core/api/resourceHooks';
import { loadHands } from '../storage';
import type { Hand } from '../types';

export function useHands() {
  return useAepList<Hand>('hands', {
    moduleId: 'bridge',
    queryFn: async () => loadHands(),
    sort: (a, b) => {
      const aKey = a.played_at || a.create_time || '';
      const bKey = b.played_at || b.create_time || '';
      return bKey.localeCompare(aKey);
    },
  });
}
