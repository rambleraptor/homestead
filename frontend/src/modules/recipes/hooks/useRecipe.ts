/**
 * Single Recipe Query Hook
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepGet } from '@/core/api/resourceHooks';
import type { Recipe } from '../types';

export function useRecipe(id: string | null) {
  return useAepGet<Recipe>(AepCollections.RECIPES, id, { moduleId: 'recipes' });
}
