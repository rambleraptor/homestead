import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { GroceryItem } from '../types';

export function useDeleteAllGroceries() {
  const queryClient = useQueryClient();
  return useMutation({
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
