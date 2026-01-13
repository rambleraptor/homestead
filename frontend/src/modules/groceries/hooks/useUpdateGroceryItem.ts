/**
 * Update Grocery Item Hook
 *
 * Mutation for updating grocery items (toggle checked, edit name/notes) - online or offline
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { useOnlineStatus } from '@/core/hooks/useOnlineStatus';
import { categorizeGroceryItem } from '@/core/services/gemini';
import { logger } from '@/core/utils/logger';
import {
  getGroceriesLocally,
  saveGroceriesLocally,
  addPendingMutation,
} from '../utils/offline-storage';
import type { GroceryItem } from '../types';

interface UpdateGroceryItemParams {
  id: string;
  data: Partial<{
    name: string;
    notes: string;
    checked: boolean;
  }>;
}

export function useUpdateGroceryItem() {
  const queryClient = useQueryClient();
  useOnlineStatus(); // Subscribe to online status changes for re-renders

  return useMutation({
    mutationFn: async ({ id, data }: UpdateGroceryItemParams) => {
      // Check current online status at execution time
      const isCurrentlyOnline = navigator.onLine;
      logger.info(`Updating grocery item ${id} (${isCurrentlyOnline ? 'online' : 'offline'})`);

      // When offline, queue the mutation
      if (!isCurrentlyOnline) {
        // Queue the mutation for later sync
        await addPendingMutation({
          id: crypto.randomUUID(),
          type: 'update',
          collection: 'groceries',
          timestamp: Date.now(),
          itemId: id,
          data,
        });

        logger.info(`Queued offline update for item: ${id}`);
        return { id, ...data };
      }

      // When online, update via PocketBase
      // If name is being updated, re-categorize the item
      if (data.name) {
        const category = await categorizeGroceryItem(data.name);
        logger.info(`Re-categorizing item: ${data.name} -> ${category}`);

        const updateData: Partial<GroceryItem> = {
          ...data,
          category,
        };

        const item = await getCollection<GroceryItem>(Collections.GROCERIES).update(id, updateData);
        return item;
      }

      // Otherwise, just update the data as-is
      const item = await getCollection<GroceryItem>(Collections.GROCERIES).update(id, data);
      return item;
    },
    onSuccess: async (_, { id, data }) => {
      const isCurrentlyOnline = navigator.onLine;

      // Update both IndexedDB and React Query cache
      if (!isCurrentlyOnline) {
        const cached = await getGroceriesLocally();
        const updated = cached.map((item) =>
          item.id === id ? { ...item, ...data, updated: new Date().toISOString() } : item
        );
        await saveGroceriesLocally(updated);

        // Directly update React Query cache for offline mode
        queryClient.setQueryData(
          [...queryKeys.module('groceries').list(), { isOnline: false }],
          updated
        );
      }

      // Invalidate all groceries queries to refresh
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('groceries').list(),
        exact: false
      });
    },
    onError: (error) => {
      logger.error('Failed to update grocery item', error);
    },
  });
}
