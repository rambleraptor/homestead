/**
 * Mark Store Completed Hook — branches on the `groceries` flag.
 *
 * Deletes all grocery items belonging to the given store. In aepbase mode
 * we list all items and filter client-side since aepbase has no filter
 * expression equivalent.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';

interface MarkStoreCompletedParams {
  storeId: string | null; // null for items without a store
}

export function useMarkStoreCompleted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storeId }: MarkStoreCompletedParams) => {
      const matches = (item: GroceryItem) =>
        storeId ? item.store === storeId : !item.store;

      if (isAepbaseEnabled('groceries')) {
        const all = await aepbase.list<GroceryItem>(AepCollections.GROCERIES);
        const items = all.filter(matches);
        logger.info(`Deleting ${items.length} items for completed store ${storeId || 'no-store'}`);
        await Promise.all(
          items.map((item) => aepbase.remove(AepCollections.GROCERIES, item.id)),
        );
        return { deleted: items.length, storeId };
      }

      const collection = getCollection<GroceryItem>(Collections.GROCERIES);
      const filter = storeId ? `store = "${storeId}"` : `store = ""`;
      const items = await collection.getFullList({ filter });
      logger.info(`Deleting ${items.length} items for completed store ${storeId || 'no-store'}`);
      await Promise.all(items.map((item) => collection.delete(item.id)));
      return { deleted: items.length, storeId };
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
