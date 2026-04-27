import { AepCollections } from '@/core/api/aepbase';
import { useAepUpdate } from '@/core/api/resourceHooks';
import type { Recipe, RecipeFormData } from '../types';

interface UpdateRecipeVars {
  id: string;
  data: RecipeFormData;
}

export function useUpdateRecipe() {
  return useAepUpdate<Recipe, UpdateRecipeVars>(AepCollections.RECIPES, {
    moduleId: 'recipes',
    transform: ({ data }) => ({
      title: data.title,
      source_pointer: data.source_pointer,
      parsed_ingredients: data.parsed_ingredients,
      steps: data.steps,
      method: data.method,
      prep_time: data.prep_time,
      cook_time: data.cook_time,
      servings: data.servings,
      tags: data.tags,
    }),
  });
}
