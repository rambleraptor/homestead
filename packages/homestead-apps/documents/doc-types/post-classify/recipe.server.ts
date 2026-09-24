/**
 * post_classify hook for the `recipe` doc type.
 *
 * When a document is classified as a recipe, create a matching record in the
 * Recipes app from the structured fields the classify pass already extracted
 * (ingredients, steps, times). The document's AI-inferred title becomes the
 * recipe's title. Recipe's `image` field is optional, so a plain JSON create
 * suffices — no need to copy the document's file.
 *
 * Server-only (`.server.ts`): the client build stubs this module, so its
 * cross-app import and the aepbase helper never reach the browser bundle. It is
 * only ever reached through the lazy `post_classify` thunk on the doc type.
 */

import { serverClient } from '@rambleraptor/homestead-core/server/client';
import type { PostClassifyHandler } from '../docType';
import { DOCUMENTS } from '../../resources';
import { RECIPES } from '../../../recipes/resources';
import type { Recipe, RecipeIngredient } from '../../../recipes/types';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The document's inferred title follows the classify pass's "<Document> — <Subject>"
 * shape, so a recipe document is titled e.g. "Recipe — Banana Bread". On the recipe
 * record that leading "Recipe" is redundant — the record already lives in Recipes —
 * so drop a leading "Recipe" and its dash separator (em dash, en dash, or hyphen),
 * leaving just the dish name. Titles that don't start that way are returned as-is.
 */
function stripRecipePrefix(title: string): string {
  const stripped = title.replace(/^\s*recipe\s*[—–-]\s*/i, '').trim();
  return stripped || title.trim();
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((v): v is string => v !== undefined);
}

/**
 * Coerce the extracted ingredient list into the recipe resource's shape. The
 * model fills unfound sub-fields with null (the nullable schema), and `classify`
 * only strips top-level nulls — so drop the per-ingredient nulls here rather
 * than storing a `qty: null` the number column would reject.
 */
function asIngredients(value: unknown): Partial<RecipeIngredient>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is Record<string, unknown> =>
        !!v && typeof v === 'object' && !Array.isArray(v),
    )
    .map((ing) => {
      const out: Partial<RecipeIngredient> = {};
      const item = asString(ing.item);
      const unit = asString(ing.unit);
      const raw = asString(ing.raw);
      const group = asString(ing.group);
      const qty = asNumber(ing.qty);
      if (item) out.item = item;
      if (qty !== undefined) out.qty = qty;
      if (unit) out.unit = unit;
      if (raw) out.raw = raw;
      if (group) out.group = group;
      return out;
    })
    .filter((ing) => Object.keys(ing).length > 0);
}

const handler: PostClassifyHandler = async ({ document, metadata, auth }) => {
  const recipeBody: Record<string, unknown> = {
    // `title` and `parsed_ingredients` are the recipe resource's required fields.
    // The document title carries a "Recipe — " prefix from the classify pass;
    // drop it so the recipe is titled by its dish name alone.
    title: (document.title && stripRecipePrefix(document.title)) || 'Untitled recipe',
    parsed_ingredients: asIngredients(metadata.parsed_ingredients),
  };

  const steps = asStringArray(metadata.steps);
  if (steps.length) recipeBody.steps = steps;
  const tags = asStringArray(metadata.tags);
  if (tags.length) recipeBody.tags = tags;
  const method = asString(metadata.method);
  if (method) recipeBody.method = method;
  const prepTime = asString(metadata.prep_time);
  if (prepTime) recipeBody.prep_time = prepTime;
  const cookTime = asString(metadata.cook_time);
  if (cookTime) recipeBody.cook_time = cookTime;
  const servings = asString(metadata.servings);
  if (servings) recipeBody.servings = servings;

  // Prefer a printed source; otherwise point back at the originating document.
  recipeBody.source_pointer =
    asString(metadata.source_pointer) ?? `${DOCUMENTS}/${document.id}`;
  if (document.created_by) recipeBody.created_by = document.created_by;

  const created = await serverClient(auth.token).collection<Recipe>(RECIPES).create(recipeBody);
  return { linked_resource: `${RECIPES}/${created.id}` };
};

export default handler;
