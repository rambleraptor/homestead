/**
 * Recipes Module Types
 */

export interface RecipeIngredient {
  item: string;
  qty: number;
  unit: string;
  raw: string;
}

/**
 * Recipe record from aepbase.
 *
 * Matches the schema in packages/homestead-modules/recipes/resources.ts.
 * `created_by` holds the aepbase resource path of the author (`users/{id}`).
 */
export interface Recipe {
  id: string;
  path: string;
  title: string;
  source_pointer?: string;
  parsed_ingredients: RecipeIngredient[];
  steps?: string[];
  method?: string;
  prep_time?: string;
  cook_time?: string;
  servings?: string;
  tags?: string[];
  created_by?: string;
  create_time: string;
  update_time: string;
}

/**
 * Form data for creating/updating recipes.
 */
export interface RecipeFormData {
  title: string;
  source_pointer?: string;
  parsed_ingredients: RecipeIngredient[];
  steps?: string[];
  method?: string;
  prep_time?: string;
  cook_time?: string;
  servings?: string;
  tags?: string[];
}
