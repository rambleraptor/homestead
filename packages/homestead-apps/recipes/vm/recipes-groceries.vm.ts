/**
 * Recipes → grocery list, on the VM tier.
 *
 * A port of the Playwright recipes-groceries spec. Covers the button on the
 * recipe view page (`/recipes/{id}`) that pushes a recipe's ingredients onto
 * the household grocery list:
 *  - each ingredient lands as its own grocery item (named after the ingredient)
 *  - an ingredient already on the list is skipped (not duplicated)
 *
 * Recipes are seeded via REST; the resulting grocery list is verified via REST.
 * Each test boots from a fresh database, so there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient, listOrEmpty } from '../../../../tests/e2e/utils/aepbase-helpers';
import { RecipesPage } from '../e2e/RecipesPage';
import { createRecipe } from '../e2e/helpers';

interface GroceryRecord {
  id: string;
  name: string;
  notes?: string;
}

const recipe = {
  title: 'Weeknight Tacos',
  parsed_ingredients: [
    { item: 'ground beef', qty: 1, unit: 'lb', raw: '1 lb ground beef' },
    { item: 'tortillas', qty: 8, unit: 'whole', raw: '8 tortillas' },
    { item: 'cheddar cheese', qty: 2, unit: 'cups', raw: '2 cups cheddar cheese' },
  ],
};

async function groceryNames(token: string): Promise<string[]> {
  const groceries = await listOrEmpty<GroceryRecord>(token, 'groceries');
  return groceries.map((g) => g.name).sort();
}

describe('Recipes → grocery list', () => {
  let h: Harness;
  let recipesPage: RecipesPage;
  let adminToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: adminToken } = await h.loginAs(h.admin));
    recipesPage = new RecipesPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('adds all ingredients to the grocery list', async () => {
    const created = await createRecipe(adminToken, recipe);

    await recipesPage.gotoRecipe(created.id);
    await recipesPage.expectOnRecipeViewPage(created.id);

    await recipesPage.addIngredientsToGroceryList();

    await expect
      .poll(() => groceryNames(adminToken))
      .toEqual(['cheddar cheese', 'ground beef', 'tortillas']);

    // Quantity + unit are carried into the item's notes.
    const groceries = await listOrEmpty<GroceryRecord>(adminToken, 'groceries');
    const beef = groceries.find((g) => g.name === 'ground beef');
    expect(beef?.notes).toBe('1 lb');
  });

  test('skips ingredients already on the grocery list', async () => {
    const created = await createRecipe(adminToken, recipe);
    // Pre-seed a matching item so it should not be added a second time.
    await e2eClient(adminToken).collection<GroceryRecord>('groceries').create({ name: 'tortillas' });

    await recipesPage.gotoRecipe(created.id);
    await recipesPage.expectOnRecipeViewPage(created.id);

    await recipesPage.addIngredientsToGroceryList();

    await expect
      .poll(() => groceryNames(adminToken))
      .toEqual(['cheddar cheese', 'ground beef', 'tortillas']);

    // Exactly one "tortillas" row — the pre-seeded one was not duplicated.
    const groceries = await listOrEmpty<GroceryRecord>(adminToken, 'groceries');
    expect(groceries.filter((g) => g.name === 'tortillas')).toHaveLength(1);
  });
});
