/**
 * Recipes E2E helpers — seed recipes via the aepbase REST API and the
 * sample data the recipes specs use.
 */

import { deleteIfPresent, e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface RecipeIngredientInput {
  item: string;
  qty: number;
  unit: string;
  raw?: string;
  group?: string;
}

export interface CreateRecipeInput {
  title: string;
  parsed_ingredients: RecipeIngredientInput[];
  source_pointer?: string;
  method?: string;
  steps?: string[];
  prep_time?: string;
  cook_time?: string;
  servings?: string;
  tags?: string[];
}

export interface RecipeRecord {
  id: string;
  title: string;
  source_pointer?: string;
  parsed_ingredients: RecipeIngredientInput[];
  method?: string;
  steps?: string[];
  prep_time?: string;
  cook_time?: string;
  servings?: string;
  tags?: string[];
}

export async function createRecipe(
  token: string,
  data: CreateRecipeInput,
): Promise<RecipeRecord> {
  return e2eClient(token).collection<RecipeRecord>('recipes').create({
    title: data.title,
    source_pointer: data.source_pointer,
    parsed_ingredients: data.parsed_ingredients.map((ing) => ({
      ...ing,
      raw: ing.raw ?? `${ing.qty} ${ing.unit} ${ing.item}`.trim(),
    })),
    method: data.method,
    steps: data.steps,
    prep_time: data.prep_time,
    cook_time: data.cook_time,
    servings: data.servings,
    tags: data.tags,
  });
}

export async function deleteAllRecipes(token: string) {
  const items = await e2eClient(token).collection<{ id: string }>('recipes').listAll();
  for (const item of items) {
    await deleteIfPresent(token, 'recipes', item.id, { force: true });
  }
}

export const testRecipes = [
  {
    title: 'Garlic Pasta',
    source_pointer: 'https://example.com/garlic-pasta',
    parsed_ingredients: [
      { item: 'spaghetti', qty: 200, unit: 'g', raw: '200g spaghetti' },
      { item: 'garlic', qty: 4, unit: 'clove', raw: '4 cloves garlic' },
      { item: 'olive oil', qty: 3, unit: 'tbsp', raw: '3 tbsp olive oil' },
    ],
    method: '1. Boil pasta. 2. Sauté garlic in oil. 3. Toss together.',
    tags: ['dinner', 'vegetarian', 'pasta'],
  },
  {
    title: 'Oat Milk Latte',
    source_pointer: 'Book: Coffee Lab pg 42',
    parsed_ingredients: [
      { item: 'oat milk', qty: 1, unit: 'cup', raw: '1 cup oat milk' },
      { item: 'espresso', qty: 2, unit: 'shot', raw: '2 shots espresso' },
    ],
    method: '1. Steam oat milk. 2. Pull espresso. 3. Pour over.',
    tags: ['drink', 'breakfast'],
  },
];
