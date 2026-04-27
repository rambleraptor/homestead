/**
 * Recipes Query Hook
 *
 * aepbase has no `sort` query param, so we order client-side by
 * `create_time` desc (newest first).
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepList } from '@/core/api/resourceHooks';
import type { Recipe } from '../types';

export function useRecipes() {
  return useAepList<Recipe>(AepCollections.RECIPES, {
    moduleId: 'recipes',
    sort: (a, b) => (b.create_time || '').localeCompare(a.create_time || ''),
  });
}
