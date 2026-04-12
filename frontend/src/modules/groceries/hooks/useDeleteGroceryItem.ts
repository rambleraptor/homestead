/**
 * Delete Grocery Item Hook — branches on the `groceries` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';

export function useDeleteGroceryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isAepbaseEnabled('groceries')) {
        await aepbase.remove(AepCollections.GROCERIES, id);
        return;
      }
      await getCollection(Collections.GROCERIES).delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to delete grocery item', error);
    },
  });
}
