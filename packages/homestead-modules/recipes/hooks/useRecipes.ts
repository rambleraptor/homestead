/**
 * Recipes Query Hook
 *
 * aepbase has no `sort` query param, so we order client-side by
 * `create_time` desc (newest first).
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { Recipe } from '../types';

export function useRecipes() {
  return useQuery({
    queryKey: queryKeys.module('recipes').list(),
    queryFn: async (): Promise<Recipe[]> => {
      const recipes = await aepbase.list<Recipe>(AepCollections.RECIPES);
      return recipes.sort((a, b) =>
        (b.create_time || '').localeCompare(a.create_time || ''),
      );
    },
  });
}
