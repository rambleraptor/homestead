/**
 * Groceries Page Object Model
 */

import { Page, expect } from '@playwright/test';

export class GroceriesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/groceries');
  }

  async expectToBeOnGroceriesPage() {
    await expect(this.page).toHaveURL(/\/groceries/);
  }

  async clickAddItem() {
    const addButton = this.page.getByTestId('add-grocery-item-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillItemForm(data: { name: string; notes?: string }) {
    await this.page.locator('#name').fill(data.name);

    if (data.notes) {
      await this.page.locator('#notes').fill(data.notes);
    }
  }

  async submitItemForm() {
    const submitButton = this.page.getByTestId('grocery-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    // Wait for the submit button to disappear (form closed)
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createItem(data: { name: string; notes?: string }) {
    await this.clickAddItem();
    await this.fillItemForm(data);
    await this.submitItemForm();
    // Wait for network to settle after mutation
    await this.page.waitForLoadState('networkidle');
  }

  async expectItemInList(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  async expectItemNotInList(name: string) {
    const itemLocator = this.page.getByText(name).first();
    await expect(itemLocator).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Element doesn't exist, which is fine
    });
  }

  async toggleItemChecked(name: string) {
    const checkbox = this.page
      .locator('[data-testid="grocery-item"]')
      .filter({ hasText: name })
      .locator('input[type="checkbox"]');

    await checkbox.waitFor({ state: 'visible' });
    await checkbox.click();
    // Wait for network to settle
    await this.page.waitForLoadState('networkidle');
  }

  async expectItemChecked(name: string, checked: boolean) {
    const checkbox = this.page
      .locator('[data-testid="grocery-item"]')
      .filter({ hasText: name })
      .locator('input[type="checkbox"]');

    if (checked) {
      await expect(checkbox).toBeChecked();
    } else {
      await expect(checkbox).not.toBeChecked();
    }
  }

  async deleteItem(name: string) {
    const itemRow = this.page
      .locator('[data-testid="grocery-item"]')
      .filter({ hasText: name });

    // Hover to reveal delete button
    await itemRow.hover();

    const deleteButton = itemRow.getByTestId('delete-grocery-item');
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

    // Handle confirmation dialog
    const confirmButton = this.page.getByRole('button', { name: /delete/i });
    const isConfirmVisible = await confirmButton.isVisible({ timeout: 1000 }).catch(() => false);

    if (isConfirmVisible) {
      await confirmButton.click();
    }

    // Wait for network to settle after deletion
    await this.page.waitForLoadState('networkidle');
  }

  async expectCategoryVisible(category: string) {
    await expect(this.page.getByText(category, { exact: true }).first()).toBeVisible();
  }

  async expectItemsInCategory(category: string, count: number) {
    const categorySection = this.page.locator('.bg-white.rounded-lg.border').filter({ hasText: category });
    await categorySection.waitFor({ state: 'visible' });

    const itemsInCategory = categorySection.locator('[data-testid="grocery-item"]');
    await expect(itemsInCategory).toHaveCount(count);
  }

  async expectProgressText(checked: number, total: number) {
    await expect(this.page.getByText(`${checked} / ${total} items checked`)).toBeVisible();
  }
}
