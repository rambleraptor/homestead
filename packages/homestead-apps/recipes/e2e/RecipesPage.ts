/**
 * Recipes Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export interface RecipeFormInput {
  title: string;
  source_pointer?: string;
  method?: string;
  tags?: string[];
  ingredients: Array<{
    item: string;
    qty: number;
    unit: string;
    raw?: string;
  }>;
}

export class RecipesPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/recipes');
  }

  async expectToBeOnRecipesPage() {
    await this.driver.expectURL(/\/recipes/);
  }

  async clickAddRecipe() {
    const addButton = this.driver.getByTestId('add-recipe-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  /** Fill the form for a brand-new recipe. Adds extra ingredient rows as needed. */
  async fillRecipeForm(data: RecipeFormInput) {
    await this.driver.locator('#title').fill(data.title);

    if (data.source_pointer) {
      await this.driver.locator('#source_pointer').fill(data.source_pointer);
    }

    // Form starts with one empty ingredient row. Add more as needed.
    for (let i = 1; i < data.ingredients.length; i++) {
      await this.driver.getByTestId('add-ingredient-button').click();
    }

    for (let i = 0; i < data.ingredients.length; i++) {
      const ing = data.ingredients[i];
      await this.driver.getByTestId(`ingredient-qty-${i}`).fill(String(ing.qty));
      await this.driver.getByTestId(`ingredient-unit-${i}`).fill(ing.unit);
      await this.driver.getByTestId(`ingredient-item-${i}`).fill(ing.item);
    }

    if (data.method) {
      await this.driver.locator('#method').fill(data.method);
    }
    if (data.tags && data.tags.length > 0) {
      await this.driver.locator('#tags').fill(data.tags.join(', '));
    }
  }

  async submitRecipeForm() {
    const submit = this.driver.getByTestId('recipe-form-submit');
    await submit.waitFor({ state: 'visible' });
    await submit.click();
    await submit.waitFor({ state: 'hidden' });
  }

  async createRecipe(data: RecipeFormInput) {
    await this.clickAddRecipe();
    await this.fillRecipeForm(data);
    await this.submitRecipeForm();
    await this.driver.waitForNetworkIdle();
  }

  async clickEdit(title: string) {
    const btn = this.driver.getByTestId(`recipe-edit-${title}`);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async clickDelete(title: string) {
    const btn = this.driver.getByTestId(`recipe-delete-${title}`);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    const confirm = this.driver.getByRole('button', { name: /^delete$/i });
    await confirm.waitFor({ state: 'visible' });
    await confirm.click();
    await this.driver.waitForNetworkIdle();
  }

  /** Edit just the title of an existing recipe. */
  async editRecipeTitle(currentTitle: string, newTitle: string) {
    await this.clickEdit(currentTitle);
    await this.driver.locator('#title').waitFor({ state: 'visible' });
    await this.driver.locator('#title').fill(newTitle);
    await this.submitRecipeForm();
    await this.driver.waitForNetworkIdle();
  }

  async expectRecipeInList(title: string) {
    await this.expect(this.driver.getByTestId(`recipe-row-${title}`)).toBeVisible();
  }

  async expectRecipeNotInList(title: string) {
    await this.expect(this.driver.getByTestId(`recipe-row-${title}`)).toHaveCount(0);
  }

  async expectEmptyState() {
    await this.expect(this.driver.getByTestId('recipes-empty-state')).toBeVisible();
  }

  async gotoRecipe(id: string) {
    await this.driver.goto(`/recipes/${id}`);
  }

  /** Open the edit form from a recipe's own page. */
  async clickViewEdit() {
    await this.driver.getByTestId('recipe-view-edit').click();
    await this.driver.locator('#title').waitFor({ state: 'visible' });
  }

  async expectTitleInput(value: string) {
    await this.expect(this.driver.locator('#title')).toHaveValue(value);
  }

  /** The notice an edit form shows when someone else saves the same recipe. */
  async expectRemoteEditNotice(text: string | RegExp) {
    await this.expect(this.driver.getByTestId('remote-edit-notice')).toContainText(text);
  }

  async expectNoRemoteEditNotice() {
    await this.expect(this.driver.getByTestId('remote-edit-notice')).toBeHidden();
  }

  async loadSavedVersion() {
    await this.driver.getByTestId('remote-edit-reload').click();
  }

  async clickRecipeCard(title: string) {
    const link = this.driver.getByTestId(`recipe-view-${title}`);
    await link.waitFor({ state: 'visible' });
    await link.click();
  }

  async expectOnRecipeViewPage(id: string) {
    await this.driver.expectURL(new RegExp(`/recipes/${id}$`));
    await this.expect(this.driver.getByTestId('recipe-view')).toBeVisible();
  }

  async expectRecipeViewTitle(title: string) {
    await this.expect(
      this.driver.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
  }

  async expectRecipeViewIngredient(item: string) {
    await this.expect(
      this.driver.getByTestId('recipe-view-ingredients').getByText(item),
    ).toBeVisible();
  }

  async expectRecipeViewStep(text: string) {
    await this.expect(
      this.driver.getByTestId('recipe-view-steps').getByText(text),
    ).toBeVisible();
  }

  async expectRecipeViewIngredientGroup(name: string, items: string[]) {
    const heading = this.driver
      .getByTestId('recipe-view-ingredients')
      .getByRole('heading', { name });
    await this.expect(heading).toBeVisible();
    // The group's own wrapper: the ingredients list's child holding the heading.
    const section = this.driver
      .getByTestId('recipe-view-ingredients')
      .locator(':scope > div')
      .filter({ has: this.driver.getByRole('heading', { name }) });
    for (const item of items) {
      await this.expect(section.getByText(item)).toBeVisible();
    }
  }

  async toggleCookMode() {
    await this.driver.getByTestId('recipe-view-cook-mode').click();
  }

  async expectCookMode(on: boolean) {
    await this.expect(this.driver.getByTestId('recipe-view-cook-mode')).toHaveAttribute(
      'aria-pressed',
      String(on),
    );
    await this.expect(this.driver.getByTestId('recipe-view-cook-mode-banner')).toHaveCount(on ? 1 : 0);
  }

  async toggleCookModeIngredient(index: number) {
    await this.driver.getByTestId(`recipe-view-ingredient-${index}`).click();
  }

  async expectCookModeIngredientChecked(index: number, checked: boolean) {
    await this.expect(this.driver.getByTestId(`recipe-view-ingredient-${index}`)).toHaveAttribute(
      'aria-pressed',
      String(checked),
    );
  }

  async selectCookModeStep(index: number) {
    await this.driver.getByTestId(`recipe-view-step-${index}`).click();
  }

  async expectCookModeCurrentStep(index: number) {
    await this.expect(this.driver.getByTestId(`recipe-view-step-${index}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  async expectRecipeViewMethod(text: string) {
    await this.expect(
      this.driver.getByTestId('recipe-view-method'),
    ).toContainText(text);
  }

  async expectRecipeViewMeta(text: string) {
    await this.expect(this.driver.getByTestId('recipe-view-meta')).toContainText(text);
  }

  async clickBackToRecipes() {
    await this.driver.getByTestId('recipe-view-back').click();
  }

  async addIngredientsToGroceryList() {
    const btn = this.driver.getByTestId('recipe-view-add-to-groceries');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }
}
