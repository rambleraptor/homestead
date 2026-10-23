/**
 * Recipes E2E — editing a recipe someone else is saving.
 *
 * Two people can open the same recipe's edit form. When the other one saves
 * first, this form's values are stale; the change feed tells it, so the person
 * can load the saved version instead of silently writing over it.
 */

import { test } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { createRecipe, deleteAllRecipes, testRecipes } from './helpers';
import { RecipesPage } from './RecipesPage';

test.describe('Recipes — someone else saves while you edit', () => {
  test.beforeEach(async ({ userToken }) => {
    await deleteAllRecipes(userToken);
  });

  test.afterEach(async ({ userToken }) => {
    await deleteAllRecipes(userToken);
  });

  test('the edit form says so and can load their version', async ({
    page,
    authenticatedPage,
    userToken,
    householdMember,
  }) => {
    const recipes = new RecipesPage(authenticatedPage);
    const recipe = await createRecipe(userToken, testRecipes[0]!);

    const feedConnected = page.waitForResponse(
      (res) => res.url().includes('/api/events') && res.ok(),
    );
    await recipes.gotoRecipe(recipe.id);
    await recipes.expectRecipeViewTitle(recipe.title);
    await feedConnected;
    await recipes.clickViewEdit();

    await e2eClient(householdMember.token)
      .collection('recipes')
      .record(recipe.id)
      .update({ title: 'Garlic Pasta, extra garlic' });

    await recipes.expectRemoteEditNotice(
      `${householdMember.name} saved changes to this recipe while you were editing it.`,
    );
    await recipes.expectTitleInput(recipe.title);

    await recipes.loadSavedVersion();

    await recipes.expectTitleInput('Garlic Pasta, extra garlic');
    await recipes.expectNoRemoteEditNotice();
  });
});
