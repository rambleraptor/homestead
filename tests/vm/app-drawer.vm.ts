/**
 * The app drawer and sidebar pins, on the VM tier.
 *
 * The sidebar lists the apps a person has pinned; the drawer at `/apps` lists
 * every app they can use, pinned or not, and the sidebar's fixed "All apps"
 * entry opens it. Pins are a preference on the person's `user-preference`
 * record, never a grant: an unpinned app leaves the sidebar but stays in the
 * drawer and still opens by address.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { AppDrawerPage } from '../e2e/pages/AppDrawerPage';
import { DashboardPage } from '../e2e/pages/DashboardPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';

/** Seed a sidebar unpin on `user`'s preference record, as the user. */
async function unpinApps(user: { id: string; token: string }, appIds: string[]) {
  await e2eClient(user.token)
    .collection('users')
    .record(user.id)
    .collection('preferences')
    .create({ sidebar_unpinned_apps: JSON.stringify(appIds) });
}

describe('App drawer', () => {
  let h: Harness;
  let drawer: AppDrawerPage;

  beforeEach(async () => {
    h = await bootHomestead();
    drawer = new AppDrawerPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('the sidebar opens the drawer, which lists the apps a member can use', async () => {
    await h.loginAs(h.member);
    await new DashboardPage(h.driver).goto();

    await drawer.openFromSidebar();
    await drawer.expectCard('gift-cards');
    await drawer.expectCard('people');
    // Superuser-only surfaces never reach a member's drawer.
    await drawer.expectNoCard('superuser');
  });

  test('a card opens its app', async () => {
    await h.loginAs(h.member);
    await drawer.goto();
    await drawer.card('people').click();
    await h.driver.expectURL(/\/people/);
  });

  test('an unpinned app leaves the sidebar but stays in the drawer and still opens', async () => {
    await unpinApps(h.member, ['games']);
    await h.loginAs(h.member);
    await drawer.goto();

    await drawer.expectInSidebar(/gift card/i);
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectCard('games');

    await drawer.card('games').click();
    await h.driver.expectURL(/\/games/);

    // The pin is on the record, so a fresh load reads the same sidebar.
    await h.driver.reload();
    await drawer.expectInSidebar(/gift card/i);
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.sidebarLink.waitFor({ state: 'visible' });
  });

  test('the superuser sees their own apps in the drawer', async () => {
    await h.loginAs(h.admin);
    await drawer.goto();
    await drawer.expectCard('superuser');
    await drawer.expectCard('gift-cards');
  });
});
