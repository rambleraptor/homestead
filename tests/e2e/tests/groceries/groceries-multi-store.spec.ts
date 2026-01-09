/**
 * Groceries E2E Tests - Multi-Store Functionality
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { GroceriesPage } from '../../pages/GroceriesPage';
import { testGroceryItems, testStores } from '../../fixtures/test-data';
import {
  createStore,
  createMultipleStores,
  createGroceryItem,
  createMultipleGroceryItems,
  deleteAllGroceryItems,
  deleteAllStores,
} from '../../utils/pocketbase-helpers';

test.describe('Groceries - Multi-Store', () => {
  let groceriesPage: GroceriesPage;

  test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
    groceriesPage = new GroceriesPage(authenticatedPage);

    // Clean up any existing data for this test user
    await deleteAllGroceryItems(userPocketbase);
    await deleteAllStores(userPocketbase);

    await groceriesPage.goto();
  });

  test.describe('Store Management', () => {
    test('should create a new store', async () => {
      await groceriesPage.openStoreManagement();

      await groceriesPage.createStore(testStores[0].name);

      // Verify it appears in the management panel
      await groceriesPage.expectStoreInManagement(testStores[0].name);
    });

    test('should create multiple stores', async () => {
      await groceriesPage.openStoreManagement();

      for (const store of testStores.slice(0, 3)) {
        await groceriesPage.createStore(store.name);
      }

      // Verify all appear in the management panel
      for (const store of testStores.slice(0, 3)) {
        await groceriesPage.expectStoreInManagement(store.name);
      }
    });

    test('should delete a store', async () => {
      // Create a store first
      await groceriesPage.openStoreManagement();
      await groceriesPage.createStore(testStores[0].name);

      // Verify it exists
      await groceriesPage.expectStoreInManagement(testStores[0].name);

      // Delete it
      await groceriesPage.deleteStore(testStores[0].name);

      // Verify it's removed
      await groceriesPage.expectStoreNotInManagement(testStores[0].name);
    });

    test('should toggle store management panel', async () => {
      // Open the panel
      await groceriesPage.openStoreManagement();

      // Close the panel
      await groceriesPage.closeStoreManagement();

      // Open it again
      await groceriesPage.openStoreManagement();
    });
  });

  test.describe('Creating Items with Stores', () => {
    test('should create item with store selection', async ({ userPocketbase }) => {
      // Create a store via API first
      const store = await createStore(userPocketbase, testStores[0]);

      await groceriesPage.goto();

      // Create an item and assign it to the store
      await groceriesPage.createItem({
        name: testGroceryItems[0].name,
        store: store.id,
      });

      // Verify item appears in the list
      await groceriesPage.expectItemInList(testGroceryItems[0].name);

      // Verify store header is visible
      await groceriesPage.expectStoreHeaderVisible(testStores[0].name);

      // Verify item appears under the correct store
      await groceriesPage.expectItemInStore(testStores[0].name, testGroceryItems[0].name);
    });

    test('should create item without store (No Store section)', async () => {
      // Create an item without a store
      await groceriesPage.createItem({
        name: testGroceryItems[0].name,
        store: '', // No store selected
      });

      // Verify item appears in the list
      await groceriesPage.expectItemInList(testGroceryItems[0].name);

      // Verify "No Store" header is visible
      await groceriesPage.expectStoreHeaderVisible('No Store');

      // Verify item appears under "No Store"
      await groceriesPage.expectItemInStore('No Store', testGroceryItems[0].name);
    });
  });

  test.describe('Store Grouping and Display', () => {
    test('should group items by store', async ({ userPocketbase }) => {
      // Create stores
      const wholeFoods = await createStore(userPocketbase, testStores[0]); // Whole Foods
      const costco = await createStore(userPocketbase, testStores[1]); // Costco

      // Create items for different stores
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id }, // Milk at Whole Foods
        { ...testGroceryItems[1], store: wholeFoods.id }, // Apples at Whole Foods
        { ...testGroceryItems[2], store: costco.id }, // Chicken at Costco
        { ...testGroceryItems[3], store: costco.id }, // Bread at Costco
      ]);

      await groceriesPage.goto();

      // Verify store headers are visible
      await groceriesPage.expectStoreHeaderVisible('Whole Foods');
      await groceriesPage.expectStoreHeaderVisible('Costco');

      // Verify items appear under correct stores
      await groceriesPage.expectItemInStore('Whole Foods', testGroceryItems[0].name);
      await groceriesPage.expectItemInStore('Whole Foods', testGroceryItems[1].name);
      await groceriesPage.expectItemInStore('Costco', testGroceryItems[2].name);
      await groceriesPage.expectItemInStore('Costco', testGroceryItems[3].name);
    });

    test('should group items by store and category', async ({ userPocketbase }) => {
      // Create a store
      const wholeFoods = await createStore(userPocketbase, testStores[0]);

      // Create items from different categories for same store
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id }, // Milk - Dairy & Eggs
        { ...testGroceryItems[4], store: wholeFoods.id }, // Yogurt - Dairy & Eggs
        { ...testGroceryItems[1], store: wholeFoods.id }, // Apples - Produce
        { ...testGroceryItems[5], store: wholeFoods.id }, // Bananas - Produce
      ]);

      await groceriesPage.goto();

      // Verify store header
      await groceriesPage.expectStoreHeaderVisible('Whole Foods');

      // Verify categories are visible within the store
      await groceriesPage.expectCategoryVisible('Dairy & Eggs');
      await groceriesPage.expectCategoryVisible('Produce');

      // Verify correct number of items in each category
      await groceriesPage.expectItemsInCategory('Dairy & Eggs', 2);
      await groceriesPage.expectItemsInCategory('Produce', 2);
    });

    test('should show mixed store and no-store items', async ({ userPocketbase }) => {
      // Create a store
      const wholeFoods = await createStore(userPocketbase, testStores[0]);

      // Create some items with store, some without
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id }, // Milk at Whole Foods
        { ...testGroceryItems[1], store: wholeFoods.id }, // Apples at Whole Foods
        { ...testGroceryItems[2], store: '' }, // Chicken - No Store
        { ...testGroceryItems[3], store: '' }, // Bread - No Store
      ]);

      await groceriesPage.goto();

      // Verify both store headers are visible
      await groceriesPage.expectStoreHeaderVisible('Whole Foods');
      await groceriesPage.expectStoreHeaderVisible('No Store');

      // Verify items are under correct stores
      await groceriesPage.expectItemInStore('Whole Foods', testGroceryItems[0].name);
      await groceriesPage.expectItemInStore('Whole Foods', testGroceryItems[1].name);
      await groceriesPage.expectItemInStore('No Store', testGroceryItems[2].name);
      await groceriesPage.expectItemInStore('No Store', testGroceryItems[3].name);
    });

    test('should maintain functionality after deleting a store', async ({ userPocketbase }) => {
      // Create stores and items
      const wholeFoods = await createStore(userPocketbase, testStores[0]);
      const costco = await createStore(userPocketbase, testStores[1]);

      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id }, // Milk at Whole Foods
        { ...testGroceryItems[1], store: costco.id }, // Apples at Costco
      ]);

      await groceriesPage.goto();

      // Verify items are visible under their stores
      await groceriesPage.expectItemInStore('Whole Foods', testGroceryItems[0].name);
      await groceriesPage.expectItemInStore('Costco', testGroceryItems[1].name);

      // Delete Whole Foods store
      await groceriesPage.openStoreManagement();
      await groceriesPage.deleteStore('Whole Foods');
      await groceriesPage.closeStoreManagement();

      // Refresh the page to see the changes
      await groceriesPage.goto();

      // The items that were at Whole Foods should now be under "No Store"
      await groceriesPage.expectStoreHeaderVisible('No Store');
      await groceriesPage.expectItemInStore('No Store', testGroceryItems[0].name);

      // Costco items should still be there
      await groceriesPage.expectStoreHeaderVisible('Costco');
      await groceriesPage.expectItemInStore('Costco', testGroceryItems[1].name);
    });
  });

  test.describe('Store Operations', () => {
    test('should toggle and delete items across stores', async ({ userPocketbase }) => {
      // Create stores
      const wholeFoods = await createStore(userPocketbase, testStores[0]);
      const costco = await createStore(userPocketbase, testStores[1]);

      // Create items
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id, checked: false },
        { ...testGroceryItems[1], store: costco.id, checked: false },
      ]);

      await groceriesPage.goto();

      // Toggle item in first store
      await groceriesPage.toggleItemChecked(testGroceryItems[0].name);
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, true);

      // Toggle item in second store
      await groceriesPage.toggleItemChecked(testGroceryItems[1].name);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, true);

      // Delete item from first store
      await groceriesPage.deleteItem(testGroceryItems[0].name);
      await groceriesPage.expectItemNotInList(testGroceryItems[0].name);

      // Verify second store item still exists
      await groceriesPage.expectItemInStore('Costco', testGroceryItems[1].name);
    });
  });

  test.describe('Mark Store Completed', () => {
    test('should mark all items in a store as completed', async ({ userPocketbase }) => {
      // Create a store
      const wholeFoods = await createStore(userPocketbase, testStores[0]);

      // Create unchecked items for this store
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id, checked: false },
        { ...testGroceryItems[1], store: wholeFoods.id, checked: false },
        { ...testGroceryItems[2], store: wholeFoods.id, checked: false },
      ]);

      await groceriesPage.goto();

      // Verify items are unchecked
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, false);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, false);
      await groceriesPage.expectItemChecked(testGroceryItems[2].name, false);

      // Verify mark complete button is visible
      await groceriesPage.expectMarkStoreCompletedButtonVisible('Whole Foods');

      // Mark all items in the store as completed
      await groceriesPage.markStoreCompleted('Whole Foods');

      // Verify all items are now checked
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, true);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, true);
      await groceriesPage.expectItemChecked(testGroceryItems[2].name, true);

      // Verify mark complete button is no longer visible
      await groceriesPage.expectMarkStoreCompletedButtonNotVisible('Whole Foods');
    });

    test('should only mark items in the selected store', async ({ userPocketbase }) => {
      // Create stores
      const wholeFoods = await createStore(userPocketbase, testStores[0]);
      const costco = await createStore(userPocketbase, testStores[1]);

      // Create unchecked items for both stores
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id, checked: false },
        { ...testGroceryItems[1], store: wholeFoods.id, checked: false },
        { ...testGroceryItems[2], store: costco.id, checked: false },
        { ...testGroceryItems[3], store: costco.id, checked: false },
      ]);

      await groceriesPage.goto();

      // Mark Whole Foods items as completed
      await groceriesPage.markStoreCompleted('Whole Foods');

      // Verify Whole Foods items are checked
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, true);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, true);

      // Verify Costco items are still unchecked
      await groceriesPage.expectItemChecked(testGroceryItems[2].name, false);
      await groceriesPage.expectItemChecked(testGroceryItems[3].name, false);

      // Verify mark complete button is visible for Costco
      await groceriesPage.expectMarkStoreCompletedButtonVisible('Costco');
    });

    test('should mark all items in No Store section as completed', async ({ userPocketbase }) => {
      // Create items without a store
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: '', checked: false },
        { ...testGroceryItems[1], store: '', checked: false },
      ]);

      await groceriesPage.goto();

      // Verify items are unchecked
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, false);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, false);

      // Mark all "No Store" items as completed
      await groceriesPage.markStoreCompleted('No Store');

      // Verify all items are now checked
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, true);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, true);
    });

    test('should not show mark complete button when all items are checked', async ({ userPocketbase }) => {
      // Create a store
      const wholeFoods = await createStore(userPocketbase, testStores[0]);

      // Create items that are already checked
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id, checked: true },
        { ...testGroceryItems[1], store: wholeFoods.id, checked: true },
      ]);

      await groceriesPage.goto();

      // Verify items are checked
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, true);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, true);

      // Verify mark complete button is not visible
      await groceriesPage.expectMarkStoreCompletedButtonNotVisible('Whole Foods');
    });

    test('should handle mixed checked/unchecked items', async ({ userPocketbase }) => {
      // Create a store
      const wholeFoods = await createStore(userPocketbase, testStores[0]);

      // Create items with mixed states
      await createMultipleGroceryItems(userPocketbase, [
        { ...testGroceryItems[0], store: wholeFoods.id, checked: true },
        { ...testGroceryItems[1], store: wholeFoods.id, checked: false },
        { ...testGroceryItems[2], store: wholeFoods.id, checked: false },
      ]);

      await groceriesPage.goto();

      // Verify initial states
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, true);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, false);
      await groceriesPage.expectItemChecked(testGroceryItems[2].name, false);

      // Mark all items as completed (should only affect unchecked items)
      await groceriesPage.markStoreCompleted('Whole Foods');

      // Verify all items are now checked
      await groceriesPage.expectItemChecked(testGroceryItems[0].name, true);
      await groceriesPage.expectItemChecked(testGroceryItems[1].name, true);
      await groceriesPage.expectItemChecked(testGroceryItems[2].name, true);
    });
  });
});
