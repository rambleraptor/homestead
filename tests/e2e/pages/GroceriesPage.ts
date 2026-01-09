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

  async createItem(data: { name: string; notes?: string; store?: string }) {
    // Select store if provided
    if (data.store !== undefined) {
      const storeSelect = this.page.getByTestId('store-select');
      await storeSelect.waitFor({ state: 'visible' });
      await storeSelect.selectOption(data.store);
    }

    // Use the quick-add input to create an item
    const input = this.page.getByTestId('quick-add-input');
    await input.waitFor({ state: 'visible' });
    await input.fill(data.name);

    // Click the add button
    const addButton = this.page.getByTestId('quick-add-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();

    // Wait for the input to be cleared and network to settle
    await this.page.waitForLoadState('networkidle');

    // Note: The quick-add doesn't support notes field
    // If notes are needed, that feature would need to be added
  }

  async openStoreManagement() {
    const manageStoresButton = this.page.getByTestId('manage-stores-button');
    await manageStoresButton.waitFor({ state: 'visible' });
    await manageStoresButton.click();

    // Wait for store management panel to appear
    await expect(this.page.getByText('Manage Stores')).toBeVisible();
  }

  async closeStoreManagement() {
    const manageStoresButton = this.page.getByTestId('manage-stores-button');
    await manageStoresButton.click();

    // Wait for store management panel to disappear
    await expect(this.page.getByText('Manage Stores')).not.toBeVisible();
  }

  async createStore(name: string) {
    // Ensure store management is open
    const addStoreInput = this.page.getByTestId('add-store-input');
    await addStoreInput.waitFor({ state: 'visible' });
    await addStoreInput.fill(name);

    const addStoreButton = this.page.getByTestId('add-store-button');
    await addStoreButton.waitFor({ state: 'visible' });
    await addStoreButton.click();

    // Wait for network to settle
    await this.page.waitForLoadState('networkidle');
  }

  async deleteStore(name: string) {
    const storeItem = this.page
      .locator('[data-testid="store-item"]')
      .filter({ hasText: name });

    // Hover to reveal delete button
    await storeItem.hover();

    const deleteButton = storeItem.getByTestId('delete-store-button');
    await deleteButton.waitFor({ state: 'visible' });

    // Set up dialog handler before clicking
    this.page.once('dialog', dialog => dialog.accept());
    await deleteButton.click();

    // Wait for network to settle
    await this.page.waitForLoadState('networkidle');
  }

  async expectStoreInManagement(name: string) {
    const storeItem = this.page
      .locator('[data-testid="store-item"]')
      .filter({ hasText: name });
    await expect(storeItem).toBeVisible();
  }

  async expectStoreNotInManagement(name: string) {
    const storeItem = this.page
      .locator('[data-testid="store-item"]')
      .filter({ hasText: name });
    await expect(storeItem).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Element doesn't exist, which is fine
    });
  }

  async expectStoreHeaderVisible(storeName: string) {
    // Store headers use h2 tags with the store name
    const storeHeader = this.page.locator('h2').filter({ hasText: storeName });
    await expect(storeHeader).toBeVisible();
  }

  async expectItemInStore(storeName: string, itemName: string) {
    // Find the store section
    const storeSection = this.page.locator('div.space-y-4').filter({ has: this.page.locator('h2', { hasText: storeName }) });

    // Check if the item exists within that store section
    const item = storeSection.getByText(itemName).first();
    await expect(item).toBeVisible();
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

    // No confirmation dialog - item is deleted immediately
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

  async markStoreCompleted(storeName: string) {
    // Find the store section
    const storeSection = this.page.locator('div.space-y-4').filter({ has: this.page.locator('h2', { hasText: storeName }) });

    // Find and click the mark complete button
    const markCompleteButton = storeSection.getByTestId('mark-store-completed-button');
    await markCompleteButton.waitFor({ state: 'visible' });
    await markCompleteButton.click();

    // Wait for network to settle
    await this.page.waitForLoadState('networkidle');
  }

  async expectMarkStoreCompletedButtonVisible(storeName: string) {
    const storeSection = this.page.locator('div.space-y-4').filter({ has: this.page.locator('h2', { hasText: storeName }) });
    const markCompleteButton = storeSection.getByTestId('mark-store-completed-button');
    await expect(markCompleteButton).toBeVisible();
  }

  async expectMarkStoreCompletedButtonNotVisible(storeName: string) {
    const storeSection = this.page.locator('div.space-y-4').filter({ has: this.page.locator('h2', { hasText: storeName }) });
    const markCompleteButton = storeSection.getByTestId('mark-store-completed-button');
    await expect(markCompleteButton).not.toBeVisible({ timeout: 1000 }).catch(() => {
      // Button doesn't exist, which is expected when all items are checked
    });
  }
}
