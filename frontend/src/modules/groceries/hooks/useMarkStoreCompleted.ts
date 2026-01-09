/**
 * Mark Store Completed Hook
 *
 * Mutation for marking all items in a store as completed (checked)
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

      // Build filter for unchecked items in the store
      const filter = storeId
        ? `store = "${storeId}" && checked = false`
        : `store = "" && checked = false`;

      // Fetch all unchecked items for this store
      const items = await collection.getFullList({
        filter,
      });

      logger.info(`Marking ${items.length} items as completed for store ${storeId || 'no-store'}`);

      // Update all items to checked
      const updatePromises = items.map((item) =>
        collection.update(item.id, { checked: true })
      );

      await Promise.all(updatePromises);

      return {
        updated: items.length,
        storeId,
      };
    },
    onSuccess: (result) => {
      logger.info(`Successfully marked ${result.updated} items as completed`);
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to mark store as completed', error);
    },
  });
}
