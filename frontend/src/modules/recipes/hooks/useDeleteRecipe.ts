/**
 * Delete Recipe Hook
 *
 * Mutation for deleting a recipe (and cascading cooking logs)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';

export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      logger.info(`Deleting recipe: ${id}`);
      await getCollection(Collections.RECIPES).delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('recipes').list() });
    },
    onError: (error) => {
      logger.error('Failed to delete recipe', error);
    },
  });
}
