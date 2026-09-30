/**
 * Groceries E2E — offline support.
 *
 * Verifies that:
 *  1. Adding/toggling items while offline updates the UI optimistically and
 *     queues the mutations (no network call fires).
 *  2. The offline UI badge appears when the network is down.
 *  3. Online-only buttons disable when offline.
 *  4. On reconnect, paused mutations replay against aepbase in FIFO order
 *     and the server state matches what the user wrote locally.
 *
 * Reload-while-offline is intentionally NOT tested here: Playwright's
 * `setOffline(true)` cuts off all network including the dev server, so
 * `page.reload()` errors with ERR_INTERNET_DISCONNECTED. Surviving a
 * cold offline reload would require a service worker that caches the app
 * shell, which the persistence plan explicitly scoped out. Cross-session
 * persistence is covered by the unit tests on the persister.
 */

import { test, expect } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { deleteIfPresent, e2eClient, listOrEmpty } from '../../../../tests/e2e/utils/aepbase-helpers';

interface GroceryItemRecord {
  id: string;
  name: string;
  checked: boolean;
  store?: string;
}

async function deleteAllGroceriesAndStores(token: string): Promise<void> {
  const items = await listOrEmpty<{ id: string }>(token, 'groceries');
  for (const item of items) {
    await deleteIfPresent(token, 'groceries', item.id);
  }
  const stores = await listOrEmpty<{ id: string }>(token, 'stores');
  for (const store of stores) {
    await deleteIfPresent(token, 'stores', store.id);
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
    // Seed one item online so we can verify the cache survives the
    // offline → reconnect cycle without losing the row.
    await e2eClient(userToken).collection<GroceryItemRecord>('groceries').create({
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

    // Reconnect. Paused mutations should replay in FIFO order.
    await context.setOffline(false);

    // Wait until the server has all four items (pre-existing + three new).
    await expect
      .poll(
        async () => (await listOrEmpty<GroceryItemRecord>(userToken, 'groceries')).length,
        { timeout: 15000 },
      )
      .toBe(4);

    const serverItems = await listOrEmpty<GroceryItemRecord>(userToken, 'groceries');
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

  test('writes queue instead of rolling back when the browser says online but the server is unreachable', async ({
    page,
    authenticatedPage,
    userToken,
  }) => {
    // Store wifi with no internet behind it: navigator.onLine stays true,
    // but every request fails before reaching the server.
    await e2eClient(userToken).collection<GroceryItemRecord>('groceries').create({
      name: 'Eggs',
      checked: false,
    });

    await authenticatedPage.goto('/groceries');
    await expect(page.getByText('Eggs')).toBeVisible();

    await page.route('**/api/**', (route) => route.abort('internetdisconnected'));

    await page.getByRole('checkbox', { name: /Mark Eggs as checked/i }).click();
    await page.getByTestId('quick-add-input').fill('Lie-fi butter');
    await page.getByTestId('quick-add-button').click();

    // The failed request flips the app offline; nothing rolls back.
    await expect(page.getByTestId('groceries-offline-badge')).toBeVisible();
    await expect(page.getByText('Lie-fi butter')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Mark Eggs as unchecked/i })).toBeVisible();

    // The server comes back; the connectivity probe notices and the queue drains.
    await page.unroute('**/api/**');

    await expect
      .poll(
        async () => {
          const items = await listOrEmpty<GroceryItemRecord>(userToken, 'groceries');
          return items
            .map((i) => `${i.name}:${i.checked}`)
            .sort()
            .join(',');
        },
        { timeout: 30_000 },
      )
      .toBe('Eggs:true,Lie-fi butter:false');
    await expect(page.getByTestId('groceries-offline-badge')).toBeHidden();
  });
});
