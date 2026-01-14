/**
 * Groceries Query Hook
 *
 * Fetches all grocery items from PocketBase (online) or IndexedDB (offline)
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { useOnlineStatus } from '@/core/hooks/useOnlineStatus';
import {
  getGroceriesLocally,
  saveGroceriesLocally,
} from '../utils/offline-storage';
import type { GroceryItem } from '../types';

export function useGroceries() {
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.module('groceries').list(),
    networkMode: 'always', // Allow query to run even when offline
    queryFn: async () => {
      // Check current online status at execution time
      const isCurrentlyOnline = navigator.onLine;

      // When offline, return cached data from IndexedDB
      if (!isCurrentlyOnline) {
        const cachedItems = await getGroceriesLocally();
        return cachedItems;
      }

      // When online, fetch from server and cache locally
      const items = await getCollection<GroceryItem>(Collections.GROCERIES).getFullList({
        sort: 'checked,category,name',
      });

      // Save to IndexedDB for offline use
      await saveGroceriesLocally(items);

      return items;
    },
    staleTime: isOnline ? 5 * 60 * 1000 : Infinity, // Never stale when offline
    gcTime: isOnline ? 10 * 60 * 1000 : Infinity, // Don't garbage collect when offline
    refetchOnWindowFocus: isOnline, // Only refetch when online
  });
}
