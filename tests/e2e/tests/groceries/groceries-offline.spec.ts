/**
 * Groceries E2E — offline support.
 *
 * Verifies that:
 *  1. The grocery list is reachable while the network is offline (cache hit
 *     from the localStorage persister).
 *  2. Mutations queued offline replay against aepbase once the network
 *     returns, with the server state matching the user's local writes.
 *  3. The offline UI badge appears when the network is down.
 *  4. Online-only buttons disable when offline.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { aepCreate, aepList, aepRemove } from '../../utils/aepbase-helpers';

interface GroceryItemRecord {
  id: string;
  name: string;
  checked: boolean;
  store?: string;
}

async function deleteAllGroceriesAndStores(token: string): Promise<void> {
  const items = await aepList<{ id: string }>(token, 'groceries');
  for (const item of items) {
    await aepRemove(token, 'groceries', item.id);
  }
  const stores = await aepList<{ id: string }>(token, 'stores');
  for (const store of stores) {
    await aepRemove(token, 'stores', store.id);
  }
}

test.describe('Groceries — offline support', () => {
  test.beforeEach(async ({ userToken }) => {
    await deleteAllGroceriesAndStores(userToken);
  });

  test.afterEach(async ({ userToken }) => {
    await deleteAllGroceriesAndStores(userToken);
  });

  test('queued offline writes flush to aepbase on reconnect', async ({
    page,
    context,
    authenticatedPage,
    userToken,
  }) => {
    // Seed one item online so the persister has something to restore.
    await aepCreate<GroceryItemRecord>(userToken, 'groceries', {
      name: 'Pre-existing item',
      checked: false,
    });

    await authenticatedPage.goto('/groceries');
    await expect(page.getByText('Pre-existing item')).toBeVisible();

    // Drop the network. From here on the only mutations that should reach
    // aepbase are the ones that go through the React Query pause/resume queue.
    await context.setOffline(true);

    // Offline badge becomes visible.
    await expect(page.getByTestId('groceries-offline-badge')).toBeVisible();

    // Online-only buttons disable.
    await expect(page.getByTestId('notify-grocery-button')).toBeDisabled();
    await expect(page.getByTestId('upload-grocery-list-button')).toBeDisabled();

    // Add three items via the UI.
    const addItem = async (name: string) => {
      await page.getByTestId('quick-add-input').fill(name);
      await page.getByTestId('quick-add-button').click();
      // Optimistic record appears immediately even though we are offline.
      await expect(page.getByText(name)).toBeVisible();
    };
    await addItem('Offline milk');
    await addItem('Offline bread');
    await addItem('Offline cheese');

    // Toggle "Offline milk" as checked.
    await page
      .getByRole('checkbox', { name: /Mark Offline milk as checked/i })
      .click();

    // Reload the page while still offline — verifies localStorage persistence.
    await page.reload();
    await expect(page.getByTestId('groceries-offline-badge')).toBeVisible();
    await expect(page.getByText('Offline milk')).toBeVisible();
    await expect(page.getByText('Offline bread')).toBeVisible();
    await expect(page.getByText('Offline cheese')).toBeVisible();
    await expect(page.getByText('Pre-existing item')).toBeVisible();

    // Reconnect. Paused mutations should replay in FIFO order.
    await context.setOffline(false);

    // Wait until the server has all four items (pre-existing + three new).
    await expect
      .poll(
        async () => (await aepList<GroceryItemRecord>(userToken, 'groceries')).length,
        { timeout: 15000 },
      )
      .toBe(4);

    const serverItems = await aepList<GroceryItemRecord>(userToken, 'groceries');
    const names = serverItems.map((i) => i.name).sort();
    expect(names).toEqual(
      ['Offline bread', 'Offline cheese', 'Offline milk', 'Pre-existing item'].sort(),
    );

    // The toggle should have flushed too.
    const milk = serverItems.find((i) => i.name === 'Offline milk');
    expect(milk?.checked).toBe(true);

    // Offline badge clears once we're back online.
    await expect(page.getByTestId('groceries-offline-badge')).toBeHidden();
  });
});
