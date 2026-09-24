/**
 * Recipes Page Object Model
 */

import { Page, expect } from '@playwright/test';

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
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/recipes');
  }

  async expectToBeOnRecipesPage() {
    await expect(this.page).toHaveURL(/\/recipes/);
  }

  async clickAddRecipe() {
    const addButton = this.page.getByTestId('add-recipe-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  /** Fill the form for a brand-new recipe. Adds extra ingredient rows as needed. */
  async fillRecipeForm(data: RecipeFormInput) {
    await this.page.locator('#title').fill(data.title);

    if (data.source_pointer) {
      await this.page.locator('#source_pointer').fill(data.source_pointer);
    }

    // Form starts with one empty ingredient row. Add more as needed.
    for (let i = 1; i < data.ingredients.length; i++) {
      await this.page.getByTestId('add-ingredient-button').click();
    }

    for (let i = 0; i < data.ingredients.length; i++) {
      const ing = data.ingredients[i];
      await this.page.getByTestId(`ingredient-qty-${i}`).fill(String(ing.qty));
      await this.page.getByTestId(`ingredient-unit-${i}`).fill(ing.unit);
      await this.page.getByTestId(`ingredient-item-${i}`).fill(ing.item);
    }

    if (data.method) {
      await this.page.locator('#method').fill(data.method);
    }
    if (data.tags && data.tags.length > 0) {
      await this.page.locator('#tags').fill(data.tags.join(', '));
    }
  }

  async submitRecipeForm() {
    const submit = this.page.getByTestId('recipe-form-submit');
    await submit.waitFor({ state: 'visible' });
    await submit.click();
    await submit.waitFor({ state: 'hidden' });
  }

  async createRecipe(data: RecipeFormInput) {
    await this.clickAddRecipe();
    await this.fillRecipeForm(data);
    await this.submitRecipeForm();
    await this.page.waitForLoadState('networkidle');
  }

  async clickEdit(title: string) {
    const btn = this.page.getByTestId(`recipe-edit-${title}`);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async clickDelete(title: string) {
    const btn = this.page.getByTestId(`recipe-delete-${title}`);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    const confirm = this.page.getByRole('button', { name: /^delete$/i });
    await confirm.waitFor({ state: 'visible' });
    await confirm.click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Edit just the title of an existing recipe. */
  async editRecipeTitle(currentTitle: string, newTitle: string) {
    await this.clickEdit(currentTitle);
    await this.page.locator('#title').waitFor({ state: 'visible' });
    await this.page.locator('#title').fill(newTitle);
    await this.submitRecipeForm();
    await this.page.waitForLoadState('networkidle');
  }

  async expectRecipeInList(title: string) {
    await expect(this.page.getByTestId(`recipe-row-${title}`)).toBeVisible();
  }

  async expectRecipeNotInList(title: string) {
    await expect(this.page.getByTestId(`recipe-row-${title}`)).toHaveCount(0);
  }

  async expectEmptyState() {
    await expect(this.page.getByTestId('recipes-empty-state')).toBeVisible();
  }

  async gotoRecipe(id: string) {
    await this.page.goto(`/recipes/${id}`);
  }

  async clickRecipeCard(title: string) {
    const link = this.page.getByTestId(`recipe-view-${title}`);
    await link.waitFor({ state: 'visible' });
    await link.click();
  }

  async expectOnRecipeViewPage(id: string) {
    await expect(this.page).toHaveURL(new RegExp(`/recipes/${id}$`));
    await expect(this.page.getByTestId('recipe-view')).toBeVisible();
  }

  async expectRecipeViewTitle(title: string) {
    await expect(
      this.page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
  }

  async expectRecipeViewIngredient(item: string) {
    await expect(
      this.page.getByTestId('recipe-view-ingredients').getByText(item),
    ).toBeVisible();
  }

  async expectRecipeViewStep(text: string) {
    await expect(
      this.page.getByTestId('recipe-view-steps').getByText(text),
    ).toBeVisible();
  }

  async expectRecipeViewIngredientGroup(name: string, items: string[]) {
    const heading = this.page
      .getByTestId('recipe-view-ingredients')
      .getByRole('heading', { name });
    await expect(heading).toBeVisible();
    const section = heading.locator('xpath=..');
    for (const item of items) {
      await expect(section.getByText(item)).toBeVisible();
    }
  }

  async toggleCookMode() {
    await this.page.getByTestId('recipe-view-cook-mode').click();
  }

  async expectCookMode(on: boolean) {
    await expect(this.page.getByTestId('recipe-view-cook-mode')).toHaveAttribute(
      'aria-pressed',
      String(on),
    );
    await expect(this.page.getByTestId('recipe-view-cook-mode-banner')).toHaveCount(on ? 1 : 0);
  }

  async toggleCookModeIngredient(index: number) {
    await this.page.getByTestId(`recipe-view-ingredient-${index}`).click();
  }

  async expectCookModeIngredientChecked(index: number, checked: boolean) {
    await expect(this.page.getByTestId(`recipe-view-ingredient-${index}`)).toHaveAttribute(
      'aria-pressed',
      String(checked),
    );
  }

  async selectCookModeStep(index: number) {
    await this.page.getByTestId(`recipe-view-step-${index}`).click();
  }

  async expectCookModeCurrentStep(index: number) {
    await expect(this.page.getByTestId(`recipe-view-step-${index}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  async expectRecipeViewMethod(text: string) {
    await expect(
      this.page.getByTestId('recipe-view-method'),
    ).toContainText(text);
  }

  async expectRecipeViewMeta(text: string) {
    await expect(this.page.getByTestId('recipe-view-meta')).toContainText(text);
  }

  async clickBackToRecipes() {
    await this.page.getByTestId('recipe-view-back').click();
  }

  async addIngredientsToGroceryList() {
    const btn = this.page.getByTestId('recipe-view-add-to-groceries');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }
}
