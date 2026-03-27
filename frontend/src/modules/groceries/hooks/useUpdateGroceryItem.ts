/**
 * Update Grocery Item Hook
 *
 * Mutation for updating grocery items (toggle checked, edit name/notes)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
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
      const item = await getCollection<GroceryItem>(Collections.GROCERIES).update(id, data);
      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to update grocery item', error);
    },
  });
}
