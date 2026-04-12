/**
 * Delete All Groceries Hook — branches on the `groceries` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';

export function useDeleteAllGroceries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (isAepbaseEnabled('groceries')) {
        const items = await aepbase.list<GroceryItem>(AepCollections.GROCERIES);
        await Promise.all(
          items.map((item) => aepbase.remove(AepCollections.GROCERIES, item.id)),
        );
        return;
      }
      const items = await getCollection<GroceryItem>(Collections.GROCERIES).getFullList();
      await Promise.all(
        items.map((item) => getCollection(Collections.GROCERIES).delete(item.id)),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to delete all grocery items', error);
    },
  });
}
