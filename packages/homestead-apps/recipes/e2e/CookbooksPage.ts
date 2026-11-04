/**
 * Cookbooks Page Object Model — the rail on the recipes home, a cookbook's
 * own page, and the "Add to cookbook" menu on a recipe page. Written against
 * the shared `Driver`, like `RecipesPage`.
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class CookbooksPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  // ---- rail on /recipes ----------------------------------------------------

  async gotoRecipes() {
    await this.driver.goto('/recipes');
  }

  async expectCookbookInRail(name: string) {
    await this.expect(this.driver.getByTestId(`cookbook-card-${name}`)).toBeVisible();
  }

  async expectCookbookNotInRail(name: string) {
    await this.expect(this.driver.getByTestId(`cookbook-card-${name}`)).toHaveCount(0);
  }

  async expectRailCardCount(name: string, text: string | RegExp) {
    await this.expect(this.driver.getByTestId(`cookbook-card-${name}`)).toContainText(text);
  }

  async expectAutoBadgeOn(name: string) {
    await this.expect(
      this.driver.getByTestId(`cookbook-card-${name}`).getByTestId('cookbook-auto-badge'),
    ).toBeVisible();
  }

  async openCookbookFromRail(name: string) {
    await this.driver.getByTestId(`cookbook-card-${name}`).click();
    await this.expect(this.driver.getByTestId('cookbook-page')).toBeVisible();
  }

  /** Create a cookbook through the rail's "New cookbook" card and its dialog. */
  async createCookbook(name: string, description?: string) {
    await this.driver.getByTestId('cookbook-new-button').click();
    await this.driver.getByTestId('cookbook-name-input').fill(name);
    if (description) {
      await this.driver.getByTestId('cookbook-description-input').fill(description);
    }
    const save = this.driver.getByTestId('cookbook-form-save');
    await save.click();
    await save.waitFor({ state: 'hidden' });
  }

  // ---- a cookbook's page ---------------------------------------------------

  async gotoCookbook(id: string) {
    await this.driver.goto(`/recipes/cookbooks/${id}`);
    await this.expect(this.driver.getByTestId('cookbook-page')).toBeVisible();
  }

  async expectOnCookbookPage(id: string) {
    await this.driver.expectURL(new RegExp(`/recipes/cookbooks/${id}$`));
    await this.expect(this.driver.getByTestId('cookbook-page')).toBeVisible();
  }

  async expectTitle(name: string) {
    await this.expect(this.driver.getByTestId('cookbook-title')).toHaveText(name);
  }

  async expectCount(text: string | RegExp) {
    await this.expect(this.driver.getByTestId('cookbook-count')).toContainText(text);
  }

  async expectEmptyState() {
    await this.expect(this.driver.getByTestId('cookbook-empty-state')).toBeVisible();
  }

  /** The recipe titles in the cookbook, in display order. */
  async expectRecipeOrder(titles: string[]) {
    const rows = this.driver.getByTestId('cookbook-recipes').locator('li');
    await this.expect(rows).toHaveCount(titles.length);
    for (let i = 0; i < titles.length; i++) {
      await this.expect(rows.nth(i)).toContainText(titles[i]);
    }
  }

  async expectRecipeInCookbook(title: string) {
    await this.expect(this.driver.getByTestId(`cookbook-recipe-row-${title}`)).toBeVisible();
  }

  async expectRecipeNotInCookbook(title: string) {
    await this.expect(this.driver.getByTestId(`cookbook-recipe-row-${title}`)).toHaveCount(0);
  }

  async moveRecipeUp(title: string) {
    await this.driver.getByTestId(`cookbook-recipe-up-${title}`).click();
  }

  async moveRecipeDown(title: string) {
    await this.driver.getByTestId(`cookbook-recipe-down-${title}`).click();
  }

  async removeRecipe(title: string) {
    await this.driver.getByTestId(`cookbook-recipe-remove-${title}`).click();
  }

  /** Add recipes through the "Add recipes" picker, ticking them in the given order. */
  async addRecipes(titles: string[]) {
    await this.driver.getByTestId('cookbook-add-recipes').click();
    await this.driver.getByTestId('add-recipes-dialog').waitFor({ state: 'visible' });
    for (const title of titles) {
      await this.driver.getByTestId(`add-recipes-option-${title}`).click();
    }
    const submit = this.driver.getByTestId('add-recipes-submit');
    await submit.click();
    await submit.waitFor({ state: 'hidden' });
  }

  async clickAddAllToGroceries() {
    await this.driver.getByTestId('cookbook-add-all-to-groceries').click();
  }

  async openMenu() {
    await this.driver.getByTestId('cookbook-menu').click();
  }

  async expectDeleteAvailable() {
    await this.expect(this.driver.getByTestId('cookbook-delete')).toBeVisible();
  }

  async expectDeleteNotAvailable() {
    await this.expect(this.driver.getByTestId('cookbook-delete')).toHaveCount(0);
  }

  async deleteCookbook() {
    await this.driver.getByTestId('cookbook-delete').click();
    const confirm = this.driver.getByRole('button', { name: /^delete$/i });
    await confirm.click();
    await confirm.waitFor({ state: 'hidden' });
  }

  async editDetails(name: string, description?: string) {
    await this.driver.getByTestId('cookbook-edit').click();
    const nameInput = this.driver.getByTestId('cookbook-name-input');
    await nameInput.fill(name);
    if (description !== undefined) {
      await this.driver.getByTestId('cookbook-description-input').fill(description);
    }
    const save = this.driver.getByTestId('cookbook-form-save');
    await save.click();
    await save.waitFor({ state: 'hidden' });
  }

  // ---- the strip -----------------------------------------------------------

  async expectChipCurrent(name: string) {
    await this.expect(this.driver.getByTestId(`cookbook-chip-${name}`)).toHaveAttribute(
      'aria-current',
      'page',
    );
  }

  async clickChip(name: string) {
    await this.driver.getByTestId(`cookbook-chip-${name}`).click();
  }

  async clickNext() {
    await this.driver.getByTestId('cookbook-next').click();
  }

  async clickPrev() {
    await this.driver.getByTestId('cookbook-prev').click();
  }

  /** Arrow keys work from anywhere on the page that isn't a text field. */
  async pressArrowRight() {
    await this.driver.getByTestId('cookbook-page').press('ArrowRight');
  }

  async pressArrowLeft() {
    await this.driver.getByTestId('cookbook-page').press('ArrowLeft');
  }

  // ---- on a recipe page ----------------------------------------------------

  async openAddToCookbookMenu() {
    await this.driver.getByTestId('recipe-view-add-to-cookbook').click();
    await this.driver.getByTestId('add-to-cookbook-menu').waitFor({ state: 'visible' });
  }

  async toggleCookbook(name: string) {
    await this.driver.getByTestId(`add-to-cookbook-option-${name}`).click();
  }

  async expectCookbookChecked(name: string, checked: boolean) {
    const box = this.driver.getByTestId(`add-to-cookbook-option-${name}`);
    if (checked) await this.expect(box).toBeChecked();
    else await this.expect(box).not.toBeChecked();
  }

  async expectCookbookOptionDisabled(name: string) {
    await this.expect(this.driver.getByTestId(`add-to-cookbook-option-${name}`)).toBeDisabled();
  }

  async createCookbookFromMenu(name: string) {
    await this.driver.getByTestId('add-to-cookbook-new-name').fill(name);
    await this.driver.getByTestId('add-to-cookbook-create').click();
    await this.expect(this.driver.getByTestId(`add-to-cookbook-option-${name}`)).toBeVisible();
  }

  async expectRecipeChip(name: string) {
    await this.expect(this.driver.getByTestId(`recipe-cookbook-chip-${name}`).first()).toBeVisible();
  }

  async expectNoRecipeChip(name: string) {
    await this.expect(this.driver.getByTestId(`recipe-cookbook-chip-${name}`)).toHaveCount(0);
  }
}
