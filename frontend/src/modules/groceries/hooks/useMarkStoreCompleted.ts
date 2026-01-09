/**
 * Mark Store Completed Hook
 *
 * Mutation for deleting all items in a store when marking it as completed
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';

interface MarkStoreCompletedParams {
  storeId: string | null; // null for items without a store
}

export function useMarkStoreCompleted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storeId }: MarkStoreCompletedParams) => {
      const collection = getCollection<GroceryItem>(Collections.GROCERIES);

      // Build filter for all items in the store
      const filter = storeId
        ? `store = "${storeId}"`
        : `store = ""`;

      // Fetch all items for this store
      const items = await collection.getFullList({
        filter,
      });

      logger.info(`Deleting ${items.length} items for completed store ${storeId || 'no-store'}`);

      // Delete all items
      const deletePromises = items.map((item) =>
        collection.delete(item.id)
      );

      await Promise.all(deletePromises);

      return {
        deleted: items.length,
        storeId,
      };
    },
    onSuccess: (result) => {
      logger.info(`Successfully deleted ${result.deleted} items from completed store`);
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to mark store as completed', error);
    },
  });
}
