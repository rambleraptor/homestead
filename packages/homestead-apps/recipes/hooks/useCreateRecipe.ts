import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { RECIPES } from '../resources';
import { buildRecipeBody } from '../utils/recipeBody';
import type { Recipe, RecipeFormData } from '../types';

export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RecipeFormData): Promise<Recipe> => {
      const userId = aepbase.getCurrentUser()?.id;
      const createdBy = userId ? `users/${userId}` : undefined;
      return aepbase.create<Recipe>(RECIPES, buildRecipeBody(data, createdBy));
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
