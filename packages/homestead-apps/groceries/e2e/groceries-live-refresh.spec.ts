/**
 * Groceries E2E — cross-device refresh.
 *
 * The grocery list is the one screen two people use at once: one person adds
 * to it at home while the other is holding it in the shop. The server's change
 * feed (`/api/events`) tells the open tab within a moment, with polling as a
 * fallback (see `useLiveRefresh`). Writing through the client rather than a second browser
 * is the same thing from the tab's point of view — a change it did not make —
 * and it keeps the test to one page.
 */

import { test, expect } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { deleteIfPresent, e2eClient, listOrEmpty } from '../../../../tests/e2e/utils/aepbase-helpers';

interface GroceryItemRecord {
  id: string;
  name: string;
  checked: boolean;
}

/** Comfortably past the poll interval, without pinning the test to its exact value. */
const REFRESH_TIMEOUT_MS = 40_000;

async function deleteAllGroceries(token: string): Promise<void> {
  const items = await listOrEmpty<{ id: string }>(token, 'groceries');
  for (const item of items) {
    await deleteIfPresent(token, 'groceries', item.id);
  }
}

test.describe('Groceries — cross-device refresh', () => {
  test.beforeEach(async ({ userToken }) => {
    await deleteAllGroceries(userToken);
  });

  test.afterEach(async ({ userToken }) => {
    await deleteAllGroceries(userToken);
  });

  test('an item added elsewhere appears without reloading', async ({
    page,
    authenticatedPage,
    userToken,
  }) => {
    test.setTimeout(REFRESH_TIMEOUT_MS + 30_000);

    const groceries = e2eClient(userToken).collection<GroceryItemRecord>('groceries');
    await groceries.create({ name: 'Already listed', checked: false });

    await authenticatedPage.goto('/groceries');
    await expect(page.getByText('Already listed')).toBeVisible();

    // The other device adds something while this tab sits open and untouched.
    await groceries.create({ name: 'Added on another device', checked: false });

    await expect(page.getByText('Added on another device')).toBeVisible({
      timeout: REFRESH_TIMEOUT_MS,
    });
  });

  test('an edit made elsewhere arrives through the change feed, well inside the poll interval', async ({
    page,
    authenticatedPage,
    userToken,
  }) => {
    const groceries = e2eClient(userToken).collection<GroceryItemRecord>('groceries');
    const item = await groceries.create({ name: 'Oat milk', checked: false });

    // The feed has to be connected before the other device writes.
    const feedConnected = page.waitForResponse(
      (res) => res.url().includes('/api/events') && res.ok(),
    );
    await authenticatedPage.goto('/groceries');
    await expect(page.getByRole('checkbox', { name: /Mark Oat milk as checked/i })).toBeVisible();
    await feedConnected;

    await groceries.record(item.id).update({ checked: true });

    // The poll interval is 15s (60s with the feed up), so seeing this within
    // 5s means the feed delivered it.
    await expect(
      page.getByRole('checkbox', { name: /Mark Oat milk as unchecked/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
