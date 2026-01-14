/**
 * Groceries E2E Tests - Offline Functionality
 *
 * Tests for offline mode in the groceries module
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { GroceriesPage } from '../../pages/GroceriesPage';
import { testGroceryItems } from '../../fixtures/test-data';
import {
  createGroceryItem,
  deleteAllGroceryItems,
  getGroceryItems,
} from '../../utils/pocketbase-helpers';

test.describe.skip('Groceries Offline Mode', () => {
  let groceriesPage: GroceriesPage;

  test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
    groceriesPage = new GroceriesPage(authenticatedPage);

    // Clean up any existing grocery items for this test user
    await deleteAllGroceryItems(userPocketbase);

    await groceriesPage.goto();

    // Verify we start online
    await groceriesPage.expectOfflineBanner(false);
  });

  test('should show offline banner when going offline', async () => {
    // Initially online - no banner
    await groceriesPage.expectOfflineBanner(false);

    // Go offline
    await groceriesPage.setOffline();

    // Banner should appear
    await groceriesPage.expectOfflineBanner(true);

    // Come back online
    await groceriesPage.setOnline();

    // Banner should disappear
    await groceriesPage.expectOfflineBanner(false);
  });

  test('should allow creating items while offline', async ({ userPocketbase }) => {
    const itemData = testGroceryItems[0];

    // Go offline
    await groceriesPage.setOffline();
    await groceriesPage.expectOfflineBanner(true);

    // Create an item while offline
    await groceriesPage.createItemOffline(itemData);

    // Item should appear in the list with pending indicator
    await groceriesPage.expectItemInList(itemData.name);
    await groceriesPage.expectPendingIndicator(itemData.name, true);

    // Come back online
    await groceriesPage.setOnline();

    // Wait for sync
    await groceriesPage.page.waitForLoadState('networkidle');

    // Item should still be in the list but without pending indicator
    await groceriesPage.expectItemInList(itemData.name);
    await groceriesPage.expectPendingIndicator(itemData.name, false);

    // Verify the item was synced to the server
    const items = await getGroceryItems(userPocketbase);
    const syncedItem = items.find((item) => item.name === itemData.name);
    expect(syncedItem).toBeDefined();
    expect(syncedItem?.name).toBe(itemData.name);
  });

  test('should allow creating multiple items while offline', async ({ userPocketbase }) => {
    const itemsToCreate = testGroceryItems.slice(0, 3);

    // Go offline
    await groceriesPage.setOffline();
    await groceriesPage.expectOfflineBanner(true);

    // Create multiple items while offline
    for (const itemData of itemsToCreate) {
      await groceriesPage.createItemOffline(itemData);
    }

    // All items should appear with pending indicators
    for (const itemData of itemsToCreate) {
      await groceriesPage.expectItemInList(itemData.name);
      await groceriesPage.expectPendingIndicator(itemData.name, true);
    }

    // Come back online
    await groceriesPage.setOnline();

    // Wait for sync
    await groceriesPage.page.waitForLoadState('networkidle');

    // All items should still be in the list without pending indicators
    for (const itemData of itemsToCreate) {
      await groceriesPage.expectItemInList(itemData.name);
      await groceriesPage.expectPendingIndicator(itemData.name, false);
    }

    // Verify all items were synced to the server
    const items = await getGroceryItems(userPocketbase);
    expect(items.length).toBe(itemsToCreate.length);
    for (const itemData of itemsToCreate) {
      const syncedItem = items.find((item) => item.name === itemData.name);
      expect(syncedItem).toBeDefined();
    }
  });

  test('should allow toggling items while offline', async ({ userPocketbase }) => {
    const itemData = testGroceryItems[0];

    // Create an item via API while online
    await createGroceryItem(userPocketbase, itemData);

    // Refresh the page to load the item
    await groceriesPage.goto();

    // Verify item is not checked
    await groceriesPage.expectItemChecked(itemData.name, false);

    // Go offline
    await groceriesPage.setOffline();
    await groceriesPage.expectOfflineBanner(true);

    // Toggle item while offline
    await groceriesPage.toggleItemCheckedOffline(itemData.name);

    // Item should be checked in the UI
    await groceriesPage.expectItemChecked(itemData.name, true);

    // Come back online
    await groceriesPage.setOnline();

    // Wait for sync
    await groceriesPage.page.waitForLoadState('networkidle');

    // Item should still be checked
    await groceriesPage.expectItemChecked(itemData.name, true);

    // Verify the change was synced to the server
    const items = await getGroceryItems(userPocketbase);
    const syncedItem = items.find((item) => item.name === itemData.name);
    expect(syncedItem?.checked).toBe(true);
  });

  test('should allow toggling multiple items while offline', async ({ userPocketbase }) => {
    const itemsToToggle = testGroceryItems.slice(0, 3);

    // Create items via API while online
    for (const itemData of itemsToToggle) {
      await createGroceryItem(userPocketbase, itemData);
    }

    // Refresh the page to load the items
    await groceriesPage.goto();

    // Verify all items are not checked
    for (const itemData of itemsToToggle) {
      await groceriesPage.expectItemChecked(itemData.name, false);
    }

    // Go offline
    await groceriesPage.setOffline();
    await groceriesPage.expectOfflineBanner(true);

    // Toggle all items while offline
    for (const itemData of itemsToToggle) {
      await groceriesPage.toggleItemCheckedOffline(itemData.name);
    }

    // All items should be checked in the UI
    for (const itemData of itemsToToggle) {
      await groceriesPage.expectItemChecked(itemData.name, true);
    }

    // Come back online
    await groceriesPage.setOnline();

    // Wait for sync
    await groceriesPage.page.waitForLoadState('networkidle');

    // All items should still be checked
    for (const itemData of itemsToToggle) {
      await groceriesPage.expectItemChecked(itemData.name, true);
    }

    // Verify all changes were synced to the server
    const items = await getGroceryItems(userPocketbase);
    for (const itemData of itemsToToggle) {
      const syncedItem = items.find((item) => item.name === itemData.name);
      expect(syncedItem?.checked).toBe(true);
    }
  });

  test('should handle mixed offline operations (create + toggle)', async ({ userPocketbase }) => {
    const existingItem = testGroceryItems[0];
    const newItem = testGroceryItems[1];

    // Create one item via API while online
    await createGroceryItem(userPocketbase, existingItem);

    // Refresh the page to load the item
    await groceriesPage.goto();

    // Go offline
    await groceriesPage.setOffline();
    await groceriesPage.expectOfflineBanner(true);

    // Create a new item while offline
    await groceriesPage.createItemOffline(newItem);
    await groceriesPage.expectPendingIndicator(newItem.name, true);

    // Toggle the existing item while offline
    await groceriesPage.toggleItemCheckedOffline(existingItem.name);
    await groceriesPage.expectItemChecked(existingItem.name, true);

    // Come back online
    await groceriesPage.setOnline();

    // Wait for sync
    await groceriesPage.page.waitForLoadState('networkidle');

    // Both operations should be synced
    await groceriesPage.expectItemInList(newItem.name);
    await groceriesPage.expectPendingIndicator(newItem.name, false);
    await groceriesPage.expectItemChecked(existingItem.name, true);

    // Verify both changes were synced to the server
    const items = await getGroceryItems(userPocketbase);
    expect(items.length).toBe(2);

    const syncedNewItem = items.find((item) => item.name === newItem.name);
    expect(syncedNewItem).toBeDefined();

    const syncedExistingItem = items.find((item) => item.name === existingItem.name);
    expect(syncedExistingItem?.checked).toBe(true);
  });

  test('should persist offline items across page reload', async ({ userPocketbase }) => {
    const itemData = testGroceryItems[0];

    // Go offline
    await groceriesPage.setOffline();
    await groceriesPage.expectOfflineBanner(true);

    // Create an item while offline
    await groceriesPage.createItemOffline(itemData);
    await groceriesPage.expectItemInList(itemData.name);
    await groceriesPage.expectPendingIndicator(itemData.name, true);

    // Reload the page while still offline
    await groceriesPage.page.reload({ waitUntil: 'domcontentloaded' });

    // Item should still be in the list with pending indicator
    await groceriesPage.expectOfflineBanner(true);
    await groceriesPage.expectItemInList(itemData.name);
    await groceriesPage.expectPendingIndicator(itemData.name, true);

    // Come back online
    await groceriesPage.setOnline();

    // Wait for sync
    await groceriesPage.page.waitForLoadState('networkidle');

    // Item should be synced
    await groceriesPage.expectItemInList(itemData.name);
    await groceriesPage.expectPendingIndicator(itemData.name, false);

    // Verify the item was synced to the server
    const items = await getGroceryItems(userPocketbase);
    const syncedItem = items.find((item) => item.name === itemData.name);
    expect(syncedItem).toBeDefined();
  });

  test('should show toast notification after successful sync', async ({ userPocketbase }) => {
    const itemData = testGroceryItems[0];

    // Go offline
    await groceriesPage.setOffline();
    await groceriesPage.expectOfflineBanner(true);

    // Create an item while offline
    await groceriesPage.createItemOffline(itemData);

    // Come back online
    await groceriesPage.setOnline();

    // Wait for sync
    await groceriesPage.page.waitForLoadState('networkidle');

    // Look for success toast (using a flexible selector for toast notifications)
    const toast = groceriesPage.page.locator('[role="status"], [role="alert"], .toast').first();

    // Wait for toast to appear
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Check if it contains sync success message
    await expect(toast).toContainText(/synced successfully|1 item synced/i);
  });
});
