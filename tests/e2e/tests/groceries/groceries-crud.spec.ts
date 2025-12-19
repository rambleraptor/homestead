/**
 * Groceries E2E Tests - CRUD Operations
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { GroceriesPage } from '../../pages/GroceriesPage';
import { testGroceryItems } from '../../fixtures/test-data';
import {
  createGroceryItem,
  createMultipleGroceryItems,
  deleteAllGroceryItems,
} from '../../utils/pocketbase-helpers';

test.describe('Groceries CRUD', () => {
  let groceriesPage: GroceriesPage;

  test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
    groceriesPage = new GroceriesPage(authenticatedPage);

    // Clean up any existing grocery items for this test user
    await deleteAllGroceryItems(userPocketbase);

    await groceriesPage.goto();
  });

  test('should create a new grocery item', async () => {
    const itemData = testGroceryItems[0];

    await groceriesPage.createItem(itemData);

    // Verify it appears in the list
    await groceriesPage.expectItemInList(itemData.name);
  });

  test('should create multiple grocery items', async () => {
    for (const itemData of testGroceryItems.slice(0, 3)) {
      await groceriesPage.createItem(itemData);
    }

    // Verify all appear in the list
    for (const itemData of testGroceryItems.slice(0, 3)) {
      await groceriesPage.expectItemInList(itemData.name);
    }
  });

  test('should toggle item checked status', async ({ userPocketbase }) => {
    // Create an item via API for faster setup
    const item = testGroceryItems[0];
    await createGroceryItem(userPocketbase, item);

    await groceriesPage.goto();

    // Verify item appears unchecked
    await groceriesPage.expectItemInList(item.name);
    await groceriesPage.expectItemChecked(item.name, false);

    // Toggle it to checked
    await groceriesPage.toggleItemChecked(item.name);

    // Verify it's checked
    await groceriesPage.expectItemChecked(item.name, true);

    // Toggle it back to unchecked
    await groceriesPage.toggleItemChecked(item.name);

    // Verify it's unchecked
    await groceriesPage.expectItemChecked(item.name, false);
  });

  test('should delete a grocery item', async ({ userPocketbase }) => {
    // Create an item via API
    const item = testGroceryItems[0];
    await createGroceryItem(userPocketbase, item);

    await groceriesPage.goto();

    // Verify item exists
    await groceriesPage.expectItemInList(item.name);

    // Delete it
    await groceriesPage.deleteItem(item.name);

    // Verify it's removed
    await groceriesPage.expectItemNotInList(item.name);
  });

  test('should group items by category', async ({ userPocketbase }) => {
    // Create items from different categories
    const items = [
      testGroceryItems[0], // Dairy & Eggs
      testGroceryItems[1], // Produce
      testGroceryItems[2], // Meat & Seafood
      testGroceryItems[4], // Dairy & Eggs
    ];

    await createMultipleGroceryItems(userPocketbase, items);

    await groceriesPage.goto();

    // Verify categories are visible
    await groceriesPage.expectCategoryVisible('Dairy & Eggs');
    await groceriesPage.expectCategoryVisible('Produce');
    await groceriesPage.expectCategoryVisible('Meat & Seafood');

    // Verify correct number of items in each category
    await groceriesPage.expectItemsInCategory('Dairy & Eggs', 2);
    await groceriesPage.expectItemsInCategory('Produce', 1);
    await groceriesPage.expectItemsInCategory('Meat & Seafood', 1);
  });

  test('should show progress tracking', async ({ userPocketbase }) => {
    // Create 3 items, 1 checked
    const items = [
      { ...testGroceryItems[0], checked: false },
      { ...testGroceryItems[1], checked: false },
      { ...testGroceryItems[2], checked: true },
    ];

    await createMultipleGroceryItems(userPocketbase, items);

    await groceriesPage.goto();

    // Should show 1/3 items checked
    await groceriesPage.expectProgressText(1, 3);

    // Check another item
    await groceriesPage.toggleItemChecked(testGroceryItems[0].name);

    // Should show 2/3 items checked
    await groceriesPage.expectProgressText(2, 3);
  });

  test('should display empty state with no items', async () => {
    // No items created, list should be empty
    await expect(groceriesPage.page.getByText(/no items in your grocery list/i)).toBeVisible();
  });
});
