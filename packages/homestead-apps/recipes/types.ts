/**
 * Recipes App Types
 */

export interface RecipeIngredient {
  item: string;
  qty: number;
  unit: string;
  /**
   * Substitutions or other context that isn't part of the ingredient name —
   * e.g. "or 8 thighs, 4 breasts" for "1 whole chicken (or 8 thighs, 4
   * breasts)". Importers extract parenthetical asides here; absent when the
   * ingredient has no note.
   */
  notes?: string;
  raw: string;
  /**
   * Section heading the ingredient is listed under — e.g. "For the sauce" in
   * a two-component recipe. The view renders ingredients sharing a group under
   * one heading; absent for recipes without sections.
   */
  group?: string;
}

/**
 * Recipe record from aepbase.
 *
 * Matches the schema in packages/homestead-apps/recipes/resources.ts.
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
  /**
   * File-field pointer for the recipe photo. On read, aepbase echoes back a
   * `:download` URL string; the bytes are fetched via `useRecipeImageUrl`.
   */
  image?: string;
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
  /** Recipe photo to upload. Sent as a multipart file field on create. */
  image?: File | null;
}
