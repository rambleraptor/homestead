/**
 * Groceries — cross-device refresh, on the VM tier.
 *
 * A port of the Playwright groceries-live-refresh spec. The grocery list is
 * the one screen two people use at once: one person adds to it at home while
 * the other is holding it in the shop. The server's change feed
 * (`/api/events`, served in-process here) tells the open tab within a moment,
 * with polling as a fallback (see `useLiveRefresh`). Writing through the client
 * rather than a second page is the same thing from the tab's point of view — a
 * change it did not make — and it keeps the test to one page.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

interface GroceryItemRecord {
  id: string;
  name: string;
  checked: boolean;
}

/** Comfortably past the poll interval, without pinning the test to its exact value. */
const REFRESH_TIMEOUT_MS = 40_000;

describe('Groceries — cross-device refresh', () => {
  let h: Harness;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test(
    'an item added elsewhere appears without reloading',
    { timeout: REFRESH_TIMEOUT_MS + 30_000 },
    async () => {
      const d = h.driver;
      const groceries = e2eClient(userToken).collection<GroceryItemRecord>('groceries');
      await groceries.create({ name: 'Already listed', checked: false });

      await d.goto('/groceries');
      await d.expect(d.getByText('Already listed')).toBeVisible();

      // The other device adds something while this tab sits open and untouched.
      await groceries.create({ name: 'Added on another device', checked: false });

      await d.expect(d.getByText('Added on another device')).toBeVisible({
        timeout: REFRESH_TIMEOUT_MS,
      });
    },
  );

  test('an edit made elsewhere arrives through the change feed, well inside the poll interval', async () => {
    const d = h.driver;
    const groceries = e2eClient(userToken).collection<GroceryItemRecord>('groceries');
    const item = await groceries.create({ name: 'Oat milk', checked: false });

    // The feed has to be connected before the other device writes.
    const feedConnected = d.waitForResponse((res) => res.url.includes('/api/events') && res.ok);
    await d.goto('/groceries');
    await d.expect(d.getByRole('checkbox', { name: /Mark Oat milk as checked/i })).toBeVisible();
    await feedConnected;

    await groceries.record(item.id).update({ checked: true });

    // The poll interval is 15s (60s with the feed up), so seeing this within
    // 5s means the feed delivered it.
    await d
      .expect(d.getByRole('checkbox', { name: /Mark Oat milk as unchecked/i }))
      .toBeVisible({ timeout: 5_000 });
  });

  test(
    'a change by another household member is highlighted and announced by name',
    { timeout: 30_000 },
    async () => {
      const d = h.driver;
      const householdMember = h.householdMember;
      const item = await e2eClient(userToken)
        .collection<GroceryItemRecord>('groceries')
        .create({ name: 'Milk', checked: false });

      const feedConnected = d.waitForResponse((res) => res.url.includes('/api/events') && res.ok);
      await d.goto('/groceries');
      await d.expect(d.getByRole('checkbox', { name: /Mark Milk as checked/i })).toBeVisible();
      await feedConnected;

      const theirs = e2eClient(householdMember.token).collection<GroceryItemRecord>('groceries');
      await theirs.record(item.id).update({ checked: true });

      const row = d.getByTestId('grocery-item').filter({ hasText: 'Milk' });
      await d
        .expect(d.getByRole('checkbox', { name: /Mark Milk as unchecked/i }))
        .toBeVisible({ timeout: 5_000 });
      await d
        .expect(row.getByTestId('remote-change-badge'))
        .toHaveText(`Just changed by ${householdMember.name}`);
      await d.expect(d.getByText(`${householdMember.name} checked off Milk`)).toBeVisible();

      // The highlight is brief: it clears on its own.
      await d.expect(row.getByTestId('remote-change-badge')).toBeHidden({ timeout: 10_000 });

      await theirs.create({ name: 'Bread', checked: false });
      await d.expect(d.getByText(`${householdMember.name} added Bread`)).toBeVisible();
    },
  );
});
