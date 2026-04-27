/**
 * Mark Store Completed — deletes all items in a given store.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';

interface MarkStoreCompletedParams {
  storeId: string | null;
}

export function useMarkStoreCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    // Bulk delete — online-only. UI disables the trigger offline.
    networkMode: 'online',
    mutationFn: async ({ storeId }: MarkStoreCompletedParams) => {
      const all = await aepbase.list<GroceryItem>(AepCollections.GROCERIES);
      const items = all.filter((item) => (storeId ? item.store === storeId : !item.store));
      logger.info(`Deleting ${items.length} items for completed store ${storeId || 'no-store'}`);
      await Promise.all(
        items.map((item) => aepbase.remove(AepCollections.GROCERIES, item.id)),
      );
      return { deleted: items.length, storeId };
    },
    onSuccess: (result) => {
      logger.info(`Successfully deleted ${result.deleted} items from completed store`);
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => logger.error('Failed to mark store as completed', error),
  });
}
