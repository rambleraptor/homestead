/**
 * Update Grocery Item Hook — branches on the `groceries` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
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

  return useMutation({
    mutationFn: async ({ id, data }: UpdateGroceryItemParams) => {
      if (isAepbaseEnabled('groceries')) {
        return await aepbase.update<GroceryItem>(AepCollections.GROCERIES, id, data);
      }
      return await getCollection<GroceryItem>(Collections.GROCERIES).update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to update grocery item', error);
    },
  });
}
