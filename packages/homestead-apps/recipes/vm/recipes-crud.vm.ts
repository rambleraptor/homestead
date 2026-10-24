/**
 * Recipes CRUD, on the VM tier.
 *
 * A port of the Playwright recipes-crud spec (which ran as the bootstrap
 * superuser): same page object and seed helpers, but the SPA runs in happy-dom
 * against the server's in-process fetch handler. Each test boots from a fresh
 * copy of the template database, so there is no cleanup (and no flag reset) to
 * do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient, listOrEmpty } from '../../../../tests/e2e/utils/aepbase-helpers';
import { RecipesPage } from '../e2e/RecipesPage';
import { createRecipe, testRecipes } from '../e2e/helpers';

interface RecipeRecord {
  id: string;
  title: string;
  parsed_ingredients: Array<{ item: string; qty: number; unit: string; raw: string }>;
  tags?: string[];
}

describe('Recipes CRUD', () => {
  let h: Harness;
  let recipesPage: RecipesPage;
  let adminToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: adminToken } = await h.loginAs(h.admin));
    recipesPage = new RecipesPage(h.driver);
    await recipesPage.goto();
  });

  afterEach(async () => {
    await h.close();
  });

  test('shows the empty state when no recipes exist', async () => {
    await recipesPage.expectEmptyState();
  });

  test('creates a new recipe via the UI', async () => {
    const recipe = testRecipes[0];
    await recipesPage.createRecipe({
      title: recipe.title,
      source_pointer: recipe.source_pointer,
      method: recipe.method,
      tags: recipe.tags,
      ingredients: recipe.parsed_ingredients,
    });

    await recipesPage.expectRecipeInList(recipe.title);

    // Confirm the parsed ingredients made it into aepbase intact.
    const all = await listOrEmpty<RecipeRecord>(adminToken, 'recipes');
    const created = all.find((r) => r.title === recipe.title);
    expect(created).toBeDefined();
    expect(created?.parsed_ingredients).toHaveLength(recipe.parsed_ingredients.length);
    expect(created?.parsed_ingredients[0].item).toBe(recipe.parsed_ingredients[0].item);
    expect(created?.tags).toEqual(recipe.tags);
  });

  test('edits an existing recipe', async () => {
    const seed = testRecipes[0];
    const created = await createRecipe(adminToken, {
      title: seed.title,
      source_pointer: seed.source_pointer,
      parsed_ingredients: seed.parsed_ingredients,
      method: seed.method,
      tags: seed.tags,
    });

    await recipesPage.goto();
    await recipesPage.expectRecipeInList(seed.title);

    const newTitle = 'Spicy Garlic Pasta';
    await recipesPage.editRecipeTitle(seed.title, newTitle);

    await recipesPage.expectRecipeInList(newTitle);
    await recipesPage.expectRecipeNotInList(seed.title);

    const updated = await e2eClient(adminToken).collection<RecipeRecord>('recipes').get(created.id);
    expect(updated.title).toBe(newTitle);
  });

  test('deletes a recipe', async () => {
    const seed = testRecipes[1];
    await createRecipe(adminToken, {
      title: seed.title,
      parsed_ingredients: seed.parsed_ingredients,
      method: seed.method,
      tags: seed.tags,
    });

    await recipesPage.goto();
    await recipesPage.expectRecipeInList(seed.title);

    await recipesPage.clickDelete(seed.title);

    await recipesPage.expectRecipeNotInList(seed.title);
  });
});
