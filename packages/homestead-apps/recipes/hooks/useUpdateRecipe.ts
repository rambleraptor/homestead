import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { RECIPES } from '../resources';
import { buildRecipeBody } from '../utils/recipeBody';
import type { Recipe, RecipeFormData } from '../types';

/**
 * Update a recipe. A new photo goes over multipart; plain edits use
 * merge-patch JSON. aepbase PATCH merges, so omitting `image` (no new photo
 * chosen) leaves the existing photo untouched.
 */
export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: RecipeFormData;
    }): Promise<Recipe> => {
      return aepbase.update<Recipe>(RECIPES, id, buildRecipeBody(data));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('recipes').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.app('recipes').all(),
      });
    },
  });
}
