import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { GroceryItem } from '../types';

export function useDeleteAllGroceries() {
  const queryClient = useQueryClient();
  return useMutation({
    // Bulk N-delete is online-only — the UI disables the trigger when
    // offline (see GroceriesHome.tsx) instead of queueing N writes.
    networkMode: 'online',
    mutationFn: async () => {
      const items = await aepbase.list<GroceryItem>(AepCollections.GROCERIES);
      await Promise.all(
        items.map((item) => aepbase.remove(AepCollections.GROCERIES, item.id)),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => logger.error('Failed to delete all grocery items', error),
  });
}
