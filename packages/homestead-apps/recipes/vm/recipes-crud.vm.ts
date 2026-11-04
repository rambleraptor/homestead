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

  test('"Add Recipe" opens /recipes/new; saving returns to the list', async () => {
    const recipe = testRecipes[0];
    await recipesPage.clickAddRecipe();
    await recipesPage.expectOnNewRecipePage();

    await recipesPage.fillRecipeForm({
      title: recipe.title,
      ingredients: recipe.parsed_ingredients,
    });
    await recipesPage.submitRecipeForm();

    await h.driver.expectURL(/\/recipes$/);
    await recipesPage.expectRecipeInList(recipe.title);
  });

  test('cancelling a new recipe returns to the list without saving', async () => {
    await recipesPage.gotoNewRecipe();
    await recipesPage.expectOnNewRecipePage();
    await h.driver.locator('#title').fill('Never saved');

    await recipesPage.cancelRecipeForm();

    await h.driver.expectURL(/\/recipes$/);
    await recipesPage.expectEmptyState();
    expect(await listOrEmpty<RecipeRecord>(adminToken, 'recipes')).toHaveLength(0);
  });

  test('the card pencil opens /recipes/:id/edit; saving returns to the list', async () => {
    const seed = testRecipes[0];
    const created = await createRecipe(adminToken, {
      title: seed.title,
      parsed_ingredients: seed.parsed_ingredients,
    });

    await recipesPage.goto();
    await recipesPage.clickEdit(seed.title);
    await recipesPage.expectOnEditRecipePage(created.id);
    await recipesPage.expectTitleInput(seed.title);

    await h.driver.locator('#title').fill('Garlic Pasta, revised');
    await recipesPage.submitRecipeForm();

    await h.driver.expectURL(/\/recipes$/);
    await recipesPage.expectRecipeInList('Garlic Pasta, revised');
    const updated = await e2eClient(adminToken).collection<RecipeRecord>('recipes').get(created.id);
    expect(updated.title).toBe('Garlic Pasta, revised');
  });

  test('"Edit" on the recipe page opens its edit address; saving and cancel go back to the recipe', async () => {
    const seed = testRecipes[1];
    const created = await createRecipe(adminToken, {
      title: seed.title,
      parsed_ingredients: seed.parsed_ingredients,
    });

    await recipesPage.gotoRecipe(created.id);
    await recipesPage.expectOnRecipeViewPage(created.id);
    await recipesPage.clickViewEdit();
    await recipesPage.expectOnEditRecipePage(created.id);

    await h.driver.locator('#title').fill('Oat Milk Latte, iced');
    await recipesPage.submitRecipeForm();

    await recipesPage.expectOnRecipeViewPage(created.id);
    await recipesPage.expectRecipeViewTitle('Oat Milk Latte, iced');

    await recipesPage.clickViewEdit();
    await recipesPage.expectOnEditRecipePage(created.id);
    await recipesPage.cancelRecipeForm();

    await recipesPage.expectOnRecipeViewPage(created.id);
    await recipesPage.expectRecipeFormHidden();
  });

  test('reloading /recipes/:id/edit keeps the form, filled with the recipe', async () => {
    const seed = testRecipes[0];
    const created = await createRecipe(adminToken, {
      title: seed.title,
      parsed_ingredients: seed.parsed_ingredients,
    });

    await recipesPage.gotoEditRecipe(created.id);
    await recipesPage.expectOnEditRecipePage(created.id);
    await recipesPage.expectTitleInput(seed.title);

    await h.driver.reload();

    await recipesPage.expectOnEditRecipePage(created.id);
    await recipesPage.expectTitleInput(seed.title);
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
