/**
 * Update Recipe Hook
 *
 * Mutation for updating/committing changes to a recipe
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { Recipe } from '../types';
import { commitRecipeChange } from '../utils/recipeVersioning';

interface UpdateRecipeParams {
  id: string;
  original: Recipe;
  updates: Partial<Recipe>;
  commitMessage: string;
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, original, updates, commitMessage }: UpdateRecipeParams) => {
      logger.info(`Updating recipe: ${original.title} (v${original.version} → v${original.version + 1})`);
      logger.info(`Commit message: ${commitMessage}`);

      // Create the commit with versioning
      const committedChanges = commitRecipeChange(original, updates, commitMessage);

      const recipe = await getCollection<Recipe>(Collections.RECIPES).update(id, committedChanges);
      return recipe;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('recipes').list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.module('recipes').detail(variables.id) });
    },
    onError: (error) => {
      logger.error('Failed to update recipe', error);
    },
  });
}
