/**
 * Recipes Query Hook
 *
 * Fetches all recipes from PocketBase
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { Recipe } from '../types';

export function useRecipes() {
  return useQuery({
    queryKey: queryKeys.module('recipes').list(),
    queryFn: async () => {
      const items = await getCollection<Recipe>(Collections.RECIPES).getFullList({
        sort: '-last_cooked,-rating,title',
      });
      return items;
    },
  });
}
