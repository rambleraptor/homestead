/**
 * Recipe cookbooks, on the VM tier.
 *
 * Covers the rail on the recipes home, a cookbook's page (order, reorder,
 * remove, the picker, delete), the strip that moves between cookbooks, the
 * "Add to cookbook" menu on a recipe page, the automatic "From social"
 * cookbook's protections, and the engine dropping a deleted recipe out of
 * every cookbook. Each test boots from a fresh database.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient, listOrEmpty } from '../../../../tests/e2e/utils/aepbase-helpers';
import { CookbooksPage } from '../e2e/CookbooksPage';
import { RecipesPage } from '../e2e/RecipesPage';
import { createCookbook, createRecipe, type CookbookRecord } from '../e2e/helpers';

const pasta = {
  title: 'Garlic Pasta',
  parsed_ingredients: [
    { item: 'spaghetti', qty: 200, unit: 'g' },
    { item: 'garlic', qty: 4, unit: 'clove' },
  ],
  cook_time: '20 mins',
  tags: ['pasta'],
};
const salmon = {
  title: 'Miso Salmon',
  parsed_ingredients: [{ item: 'salmon', qty: 2, unit: 'fillet' }],
  cook_time: '18 mins',
};
const curry = {
  title: 'Chickpea Curry',
  parsed_ingredients: [
    { item: 'chickpeas', qty: 1, unit: 'can' },
    { item: 'garlic', qty: 2, unit: 'clove' },
  ],
  cook_time: '40 mins',
};

describe('Recipe cookbooks', () => {
  let h: Harness;
  let token: string;
  let cookbooks: CookbooksPage;
  let recipes: RecipesPage;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.admin));
    cookbooks = new CookbooksPage(h.driver);
    recipes = new RecipesPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('the rail lists cookbooks with counts and marks the automatic one', async () => {
    const r1 = await createRecipe(token, pasta);
    const r2 = await createRecipe(token, salmon);
    await createCookbook(token, { name: 'Weeknight', recipes: [r1.id, r2.id] });
    await createCookbook(token, { name: 'From social', recipes: [r2.id], auto: 'social' });

    await cookbooks.gotoRecipes();
    await cookbooks.expectCookbookInRail('Weeknight');
    await cookbooks.expectRailCardCount('Weeknight', '2 recipes');
    await cookbooks.expectRailCardCount('From social', '1 recipe');
    await cookbooks.expectAutoBadgeOn('From social');
    // The card shows which cookbooks a recipe is in.
    await cookbooks.expectRecipeChip('Weeknight');
  });

  test('creates a cookbook from the rail and opens it empty', async () => {
    await cookbooks.gotoRecipes();
    await cookbooks.createCookbook('Thanksgiving', 'The big day');
    await cookbooks.expectCookbookInRail('Thanksgiving');

    await cookbooks.openCookbookFromRail('Thanksgiving');
    await cookbooks.expectTitle('Thanksgiving');
    await cookbooks.expectCount('0 recipes');
    await cookbooks.expectEmptyState();

    const stored = await listOrEmpty<CookbookRecord>(token, 'cookbooks');
    expect(stored.map((c) => c.name)).toEqual(['Thanksgiving']);
    expect(stored[0].description).toBe('The big day');
  });

  test('adds recipes through the picker, reorders and removes them', async () => {
    const r1 = await createRecipe(token, pasta);
    const r2 = await createRecipe(token, salmon);
    const r3 = await createRecipe(token, curry);
    const book = await createCookbook(token, { name: 'Weeknight', recipes: [r1.id] });

    await cookbooks.gotoCookbook(book.id);
    await cookbooks.expectRecipeOrder([pasta.title]);

    await cookbooks.addRecipes([curry.title, salmon.title]);
    await cookbooks.expectRecipeOrder([pasta.title, curry.title, salmon.title]);

    await cookbooks.moveRecipeUp(salmon.title);
    await cookbooks.expectRecipeOrder([pasta.title, salmon.title, curry.title]);

    await cookbooks.moveRecipeDown(pasta.title);
    await cookbooks.expectRecipeOrder([salmon.title, pasta.title, curry.title]);

    await cookbooks.removeRecipe(pasta.title);
    await cookbooks.expectRecipeOrder([salmon.title, curry.title]);
    await cookbooks.expectCount('2 recipes');

    const [stored] = await listOrEmpty<CookbookRecord>(token, 'cookbooks');
    expect(stored.recipes).toEqual([r2.id, r3.id]);
  });

  test('moves between cookbooks with the strip, the arrows and the keyboard', async () => {
    const a = await createCookbook(token, { name: 'Autumn' });
    const b = await createCookbook(token, { name: 'Brunch' });
    const c = await createCookbook(token, { name: 'Camping' });

    await cookbooks.gotoCookbook(b.id);
    await cookbooks.expectChipCurrent('Brunch');

    await cookbooks.clickNext();
    await cookbooks.expectOnCookbookPage(c.id);
    await cookbooks.expectChipCurrent('Camping');

    await cookbooks.clickPrev();
    await cookbooks.expectOnCookbookPage(b.id);

    await cookbooks.pressArrowLeft();
    await cookbooks.expectOnCookbookPage(a.id);
    await cookbooks.expectChipCurrent('Autumn');

    await cookbooks.pressArrowRight();
    await cookbooks.expectOnCookbookPage(b.id);

    await cookbooks.clickChip('Camping');
    await cookbooks.expectOnCookbookPage(c.id);
  });

  test('adds and removes a recipe from its own page, and starts a cookbook from there', async () => {
    const r1 = await createRecipe(token, pasta);
    await createCookbook(token, { name: 'Weeknight' });
    await createCookbook(token, { name: 'From social', auto: 'social' });

    await recipes.gotoRecipe(r1.id);
    await cookbooks.expectNoRecipeChip('Weeknight');

    await cookbooks.openAddToCookbookMenu();
    await cookbooks.expectCookbookOptionDisabled('From social');
    await cookbooks.toggleCookbook('Weeknight');
    await cookbooks.expectCookbookChecked('Weeknight', true);
    await cookbooks.expectRecipeChip('Weeknight');

    await cookbooks.createCookbookFromMenu('Date night');
    await cookbooks.expectCookbookChecked('Date night', true);
    await cookbooks.expectRecipeChip('Date night');

    await cookbooks.toggleCookbook('Weeknight');
    await cookbooks.expectCookbookChecked('Weeknight', false);
    await cookbooks.expectNoRecipeChip('Weeknight');

    const stored = await listOrEmpty<CookbookRecord>(token, 'cookbooks');
    const byName = Object.fromEntries(stored.map((c) => [c.name, c.recipes]));
    expect(byName).toEqual({ Weeknight: [], 'From social': [], 'Date night': [r1.id] });
  });

  test('puts every recipe\'s ingredients on the grocery list once', async () => {
    const r1 = await createRecipe(token, pasta);
    const r3 = await createRecipe(token, curry);
    const book = await createCookbook(token, { name: 'Weeknight', recipes: [r1.id, r3.id] });

    await cookbooks.gotoCookbook(book.id);
    await cookbooks.clickAddAllToGroceries();

    await h.driver
      .expect(h.driver.getByText(/Added 3 ingredients to grocery list/))
      .toBeVisible();
    const items = await listOrEmpty<{ name: string }>(token, 'groceries');
    expect(items.map((g) => g.name).sort()).toEqual(['chickpeas', 'garlic', 'spaghetti']);
  });

  test('a person can delete their cookbook but not the automatic one', async () => {
    const mine = await createCookbook(token, { name: 'Weeknight' });
    const social = await createCookbook(token, { name: 'From social', auto: 'social' });

    await cookbooks.gotoCookbook(social.id);
    await cookbooks.openMenu();
    await cookbooks.expectDeleteNotAvailable();

    await cookbooks.gotoCookbook(mine.id);
    await cookbooks.openMenu();
    await cookbooks.expectDeleteAvailable();
    await cookbooks.deleteCookbook();

    await recipes.expectToBeOnRecipesPage();
    await cookbooks.expectCookbookNotInRail('Weeknight');
    await cookbooks.expectCookbookInRail('From social');
  });

  test('edits a cookbook\'s name and description', async () => {
    const book = await createCookbook(token, { name: 'Weeknight' });
    await cookbooks.gotoCookbook(book.id);
    await cookbooks.openMenu();
    await cookbooks.editDetails('School nights', 'Under 40 minutes');
    await cookbooks.expectTitle('School nights');
    await h.driver.expect(h.driver.getByTestId('cookbook-description')).toHaveText('Under 40 minutes');
  });

  test('deleting a recipe drops it out of every cookbook', async () => {
    const r1 = await createRecipe(token, pasta);
    const r2 = await createRecipe(token, salmon);
    const book = await createCookbook(token, { name: 'Weeknight', recipes: [r1.id, r2.id] });

    await e2eClient(token).collection('recipes').record(r1.id).delete();

    const stored = await e2eClient(token).collection<CookbookRecord>('cookbooks').record(book.id).get();
    expect(stored.recipes).toEqual([r2.id]);

    await cookbooks.gotoCookbook(book.id);
    await cookbooks.expectRecipeOrder([salmon.title]);
  });
});
