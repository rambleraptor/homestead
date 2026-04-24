/**
 * Recipes module E2E tests
 *
 * Covers CRUD on /recipes plus the module-level `enabled` flag which
 * gates the sidebar entry. The flag has three values:
 *   - 'superusers' (default): only superusers see Recipes in the sidebar
 *   - 'all':        every signed-in user sees it
 *   - 'none':       nobody sees it (no superuser bypass)
 *
 * All data operations use `adminToken` (the persistent superuser session
 * loaded once per worker). Earlier runs that used a per-test `userToken`
 * hit intermittent 401s — the regular test user is torn down between
 * tests and its token can race against in-flight requests. The admin
 * token survives the whole run, which mirrors the flag-management spec.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { RecipesPage } from '../../pages/RecipesPage';
import { testRecipes } from '../../fixtures/test-data';
import {
  aepGet,
  aepList,
  createRecipe,
  deleteAllRecipes,
  resetModuleFlags,
  setModuleFlag,
} from '../../utils/aepbase-helpers';

interface RecipeRecord {
  id: string;
  title: string;
  parsed_ingredients: Array<{ item: string; qty: number; unit: string; raw: string }>;
  tags?: string[];
}

test.describe('Recipes CRUD', () => {
  let recipesPage: RecipesPage;

  test.beforeEach(async ({ adminToken, authenticatedAdminPage }) => {
    await resetModuleFlags(adminToken);
    await deleteAllRecipes(adminToken);

    recipesPage = new RecipesPage(authenticatedAdminPage);
    await recipesPage.goto();
  });

  test.afterEach(async ({ adminToken }) => {
    await deleteAllRecipes(adminToken);
    await resetModuleFlags(adminToken);
  });

  test('shows the empty state when no recipes exist', async () => {
    await recipesPage.expectEmptyState();
  });

  test('creates a new recipe via the UI', async ({ adminToken }) => {
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
    const all = await aepList<RecipeRecord>(adminToken, 'recipes');
    const created = all.find((r) => r.title === recipe.title);
    expect(created).toBeDefined();
    expect(created?.parsed_ingredients).toHaveLength(recipe.parsed_ingredients.length);
    expect(created?.parsed_ingredients[0].item).toBe(
      recipe.parsed_ingredients[0].item,
    );
  });

  test('edits an existing recipe', async ({ adminToken }) => {
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

    const updated = await aepGet<RecipeRecord>(adminToken, 'recipes', created.id);
    expect(updated.title).toBe(newTitle);
  });

  test('deletes a recipe', async ({ adminToken }) => {
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

test.describe('Recipes visibility flag', () => {
  test.afterEach(async ({ adminToken }) => {
    await resetModuleFlags(adminToken);
  });

  test("default ('superuser') hides Recipes from regular users", async ({
    adminToken,
    authenticatedPage,
  }) => {
    await resetModuleFlags(adminToken);
    await authenticatedPage.goto('/dashboard');
    const recipesPage = new RecipesPage(authenticatedPage);
    await recipesPage.expectSidebarLinkHidden();
  });

  test("default ('superuser') shows Recipes to superusers", async ({
    adminToken,
    authenticatedAdminPage,
  }) => {
    await resetModuleFlags(adminToken);
    await authenticatedAdminPage.goto('/dashboard');
    const recipesPage = new RecipesPage(authenticatedAdminPage);
    await recipesPage.expectSidebarLinkVisible();
  });

  test("'all' shows Recipes to regular users", async ({
    adminToken,
    authenticatedPage,
  }) => {
    await setModuleFlag(adminToken, 'recipes', 'enabled', 'all');
    await authenticatedPage.goto('/dashboard');
    const recipesPage = new RecipesPage(authenticatedPage);
    await recipesPage.expectSidebarLinkVisible();
  });

  test("'none' hides Recipes from superusers as well", async ({
    adminToken,
    authenticatedAdminPage,
  }) => {
    await setModuleFlag(adminToken, 'recipes', 'enabled', 'none');
    await authenticatedAdminPage.goto('/dashboard');
    const recipesPage = new RecipesPage(authenticatedAdminPage);
    await recipesPage.expectSidebarLinkHidden();
  });
});
