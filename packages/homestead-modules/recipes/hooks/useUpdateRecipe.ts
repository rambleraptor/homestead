import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { Recipe, RecipeFormData } from '../types';

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
      return aepbase.update<Recipe>(AepCollections.RECIPES, id, {
        title: data.title,
        source_pointer: data.source_pointer,
        parsed_ingredients: data.parsed_ingredients,
        steps: data.steps,
        method: data.method,
        prep_time: data.prep_time,
        cook_time: data.cook_time,
        servings: data.servings,
        tags: data.tags,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('recipes').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('recipes').all(),
      });
    },
    onError: (error) => logger.error('Recipe update mutation error', error),
  });
}
