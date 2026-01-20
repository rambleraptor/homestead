/**
 * Create Recipe Hook
 *
 * Mutation for creating a new recipe with version 1
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { Recipe, RecipeFormData } from '../types';
import { createInitialRecipe } from '../utils/recipeVersioning';

export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RecipeFormData) => {
      logger.info(`Creating recipe: ${data.title}`);

      // Create initial recipe with version 1
      const recipeData = createInitialRecipe({
        title: data.title,
        source_type: data.source_type,
        source_reference: data.source_reference || '',
        ingredients: data.ingredients || [],
        instructions: data.instructions || '',
        rating: data.rating,
      });

      // Handle image upload if present
      let formData: FormData | Partial<Recipe>;
      if (data.image instanceof File) {
        formData = new FormData();
        Object.entries(recipeData).forEach(([key, value]) => {
          if (value !== undefined) {
            (formData as FormData).append(
              key,
              typeof value === 'object' ? JSON.stringify(value) : String(value)
            );
          }
        });
        (formData as FormData).append('image', data.image);
      } else {
        formData = recipeData;
      }

      const recipe = await getCollection<Recipe>(Collections.RECIPES).create(formData);
      return recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('recipes').list() });
    },
    onError: (error) => {
      logger.error('Failed to create recipe', error);
    },
  });
}
