/**
 * Groceries Query Hook
 *
 * Fetches all grocery items from PocketBase
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { GroceryItem } from '../types';

export function useGroceries() {
  return useQuery({
    queryKey: queryKeys.module('groceries').list(),
    queryFn: async () => {
      const items = await getCollection<GroceryItem>(Collections.GROCERIES).getFullList({
        sort: 'checked,category,name',
      });
      return items;
    },
  });
}
