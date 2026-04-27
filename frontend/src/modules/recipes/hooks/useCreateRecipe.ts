import { AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import type { Recipe, RecipeFormData } from '../types';

export function useCreateRecipe() {
  return useAepCreate<Recipe, RecipeFormData>(AepCollections.RECIPES, {
    moduleId: 'recipes',
    transform: (data) => {
      const createdBy = currentUserPath();
      return {
        title: data.title,
        source_pointer: data.source_pointer,
        parsed_ingredients: data.parsed_ingredients,
        steps: data.steps,
        method: data.method,
        prep_time: data.prep_time,
        cook_time: data.cook_time,
        servings: data.servings,
        tags: data.tags,
        ...(createdBy ? { created_by: createdBy } : {}),
      };
    },
  });
}
