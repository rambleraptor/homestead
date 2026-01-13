/**
 * Create Grocery Item Hook
 *
 * Mutation for creating a new grocery item (online or offline)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { useOnlineStatus } from '@/core/hooks/useOnlineStatus';
import { logger } from '@/core/utils/logger';
import {
  getGroceriesLocally,
  saveGroceriesLocally,
  addPendingMutation,
} from '../utils/offline-storage';
import type { GroceryItem, GroceryItemFormData } from '../types';

export function useCreateGroceryItem() {
  const queryClient = useQueryClient();
  useOnlineStatus(); // Subscribe to online status changes for re-renders

  return useMutation({
    mutationFn: async (data: GroceryItemFormData) => {
      // Check current online status at execution time
      const isCurrentlyOnline = navigator.onLine;
      logger.info(`Creating grocery item: ${data.name} (${isCurrentlyOnline ? 'online' : 'offline'})`);

      // When offline, create temporary item and queue mutation
      if (!isCurrentlyOnline) {
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const tempItem: GroceryItem = {
          id: tempId,
          name: data.name,
          notes: data.notes || '',
          store: data.store || '',
          checked: false,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        // Add to pending mutations queue
        await addPendingMutation({
          id: crypto.randomUUID(),
          type: 'create',
          collection: 'groceries',
          timestamp: Date.now(),
          data: tempItem,
        });

        logger.info(`Queued offline creation for item: ${tempId}`);
        return tempItem;
      }

      // When online, create via PocketBase
      const item = await getCollection<GroceryItem>(Collections.GROCERIES).create({
        name: data.name,
        notes: data.notes || '',
        store: data.store || '',
        checked: false,
      });

      return item;
    },
    onSuccess: async (newItem) => {
      const isCurrentlyOnline = navigator.onLine;

      if (!isCurrentlyOnline) {
        // Offline: Update IndexedDB and React Query cache directly
        const cached = await getGroceriesLocally();
        const updated = [...cached, newItem];
        await saveGroceriesLocally(updated);

        // Directly update React Query cache - no invalidation needed
        queryClient.setQueryData(
          queryKeys.module('groceries').list(),
          updated
        );
      } else {
        // Online: Just invalidate to refetch from server
        queryClient.invalidateQueries({
          queryKey: queryKeys.module('groceries').list(),
        });
      }
    },
    onError: (error) => {
      logger.error('Failed to create grocery item', error);
    },
  });
}
