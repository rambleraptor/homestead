/**
 * Groceries list hook.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { GroceryItem } from '../types';

interface AepGroceryItem extends GroceryItem {
  path: string;
  create_time: string;
  update_time: string;
}

export function useGroceries() {
  return useQuery({
    queryKey: queryKeys.module('groceries').list(),
    queryFn: async () => {
      const items = await aepbase.list<AepGroceryItem>(AepCollections.GROCERIES);
      return items
        .map((rec) => ({
          ...rec,
          created: rec.create_time || '',
          updated: rec.update_time || '',
        }))
        .sort((a, b) => {
          if (a.checked !== b.checked) return a.checked ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
    },
    // Long enough to survive within the persister's 7-day maxAge window;
    // the global default of 10 minutes would let cache be GC'd before
    // hydration restores it on a cold offline reload.
    gcTime: 24 * 60 * 60 * 1000,
  });
}
