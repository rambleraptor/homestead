/**
 * Groceries — the ⋯ actions menu, on the VM tier.
 *
 * The header's occasional tasks (stores, notify, upload, new list) sit behind
 * a single button so the page is title, quick-add and list. These specs check
 * the menu opens, carries the right actions for the list's state, and that a
 * pick lands where the old header button used to.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

interface GroceryItemRecord {
  id: string;
  name: string;
  checked: boolean;
}

describe('Groceries — actions menu', () => {
  let h: Harness;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('the header shows one menu button; New List appears only once there are items', async () => {
    const d = h.driver;
    await d.goto('/groceries');
    await d.expect(d.getByTestId('quick-add-input')).toBeVisible();

    await d.getByTestId('groceries-menu-button').click();
    const menu = d.getByTestId('groceries-menu');
    await d.expect(menu).toBeVisible();
    await d.expect(menu.getByTestId('manage-stores-button')).toBeVisible();
    await d.expect(menu.getByTestId('notify-grocery-button')).toBeVisible();
    await d.expect(menu.getByTestId('upload-grocery-list-button')).toBeVisible();
    await d.expect(menu.getByTestId('new-grocery-list-button')).toBeHidden();

    await menu.press('Escape');
    await d.expect(menu).toBeHidden();

    await d.getByTestId('quick-add-input').fill('Milk');
    await d.getByRole('button', { name: 'Add item' }).click();
    await d.expect(d.getByText('Milk')).toBeVisible();

    await d.getByTestId('groceries-menu-button').click();
    await d.expect(d.getByTestId('new-grocery-list-button')).toBeVisible();
  });

  test('Stores opens the store panel, which can be closed again', async () => {
    const d = h.driver;
    await d.goto('/groceries');
    await d.expect(d.getByTestId('quick-add-input')).toBeVisible();

    await d.getByTestId('groceries-menu-button').click();
    await d.getByTestId('manage-stores-button').click();
    await d.expect(d.getByTestId('groceries-menu')).toBeHidden();
    await d.expect(d.getByTestId('add-store-input')).toBeVisible();

    await d.getByTestId('close-store-management').click();
    await d.expect(d.getByTestId('add-store-input')).toBeHidden();
  });

  test('New List asks for confirmation and then clears the list', async () => {
    const d = h.driver;
    const groceries = e2eClient(userToken).collection<GroceryItemRecord>('groceries');
    await groceries.create({ name: 'Eggs', checked: false });

    await d.goto('/groceries');
    await d.expect(d.getByText('Eggs')).toBeVisible();

    await d.getByTestId('groceries-menu-button').click();
    await d.getByTestId('new-grocery-list-button').click();
    await d.expect(d.getByRole('dialog', { name: 'Clear Grocery List' })).toBeVisible();
    await d.getByRole('button', { name: 'Clear List' }).click();

    await d.expect(d.getByText('Eggs')).toBeHidden();
    await d.expect(d.getByText('No items in your grocery list.')).toBeVisible();
  });
});
