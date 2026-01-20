/**
 * Recipe By ID Query Hook
 *
 * Fetches a single recipe by ID
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { Recipe } from '../types';

export function useRecipeById(recipeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.module('recipes').detail(recipeId || ''),
    queryFn: async () => {
      if (!recipeId) throw new Error('Recipe ID is required');
      return await getCollection<Recipe>(Collections.RECIPES).getOne(recipeId);
    },
    enabled: !!recipeId,
  });
}
