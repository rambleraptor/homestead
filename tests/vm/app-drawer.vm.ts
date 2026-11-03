/**
 * The app drawer and the sidebar, on the VM tier.
 *
 * The drawer at `/apps` shows every app a person can use in two lists: "Your
 * sidebar", which is the sidebar, and "More apps". One button moves an entry
 * between them, and the sidebar's fixed "All apps" entry opens the drawer.
 * A nested child (Bridge under Games) is an entry of its own. Pins are a
 * preference on the person's `user-preference` record, never a grant: an app
 * out of the sidebar stays in the drawer and still opens by address.
 *
 * Superuser → Sidebar defaults edits what a new member starts with, with the
 * same two lists; a person's own choice still wins.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { AppDrawerPage, SidebarDefaultsPage } from '../e2e/pages/AppDrawerPage';
import { DashboardPage } from '../e2e/pages/DashboardPage';
import { e2eClient, setAppFlag } from '../e2e/utils/aepbase-helpers';

/** Seed sidebar choices on `user`'s preference record, as the user. */
async function seedPins(
  user: { id: string; token: string },
  pins: { pinned?: string[]; unpinned?: string[] },
) {
  await e2eClient(user.token)
    .collection('users')
    .record(user.id)
    .collection('preferences')
    .create({
      sidebar_pinned_apps: JSON.stringify(pins.pinned ?? []),
      sidebar_unpinned_apps: JSON.stringify(pins.unpinned ?? []),
    });
}

/** Seed the household's sidebar defaults, as the superuser. */
async function seedDefaults(adminToken: string, overrides: Record<string, boolean>) {
  await setAppFlag(adminToken, 'apps', 'sidebar_defaults', JSON.stringify(overrides));
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
    await drawer.expectInLeft('gift-cards');
    await drawer.expectInLeft('people');
    // Superuser-only surfaces never reach a member's drawer.
    await drawer.expectAbsent('superuser');
  });

  test('an entry opens its app from either list', async () => {
    await h.loginAs(h.member);
    await drawer.goto();
    await drawer.open('people').click();
    await h.driver.expectURL(/\/people/);

    await drawer.goto();
    await drawer.open('bridge').click();
    await h.driver.expectURL(/\/games\/bridge/);
  });

  test('moving an app out of the sidebar keeps it in the drawer and opening by address', async () => {
    await h.loginAs(h.member);
    await drawer.goto();
    await drawer.expectInSidebar(/^games$/i);

    await drawer.remove('games');
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectInSidebar(/gift card/i);
    await drawer.expectInRight('games');

    // The choice is on the record, so a fresh load reads the same sidebar.
    await h.driver.reload();
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectInRight('games');
    await drawer.open('games').click();
    await h.driver.expectURL(/\/games$/);

    await drawer.goto();
    await drawer.add('games');
    await drawer.expectInSidebar(/^games$/i);
  });

  test('a nested app can be in the sidebar on its own, under its parent section', async () => {
    await h.loginAs(h.member);
    await drawer.goto();

    // Games is a folder tile only once it's out of the sidebar; its games
    // start out as tiles of their own.
    await drawer.expectInLeft('games');
    await drawer.expectInRight('bridge');
    await drawer.expectNotInSidebar(/^bridge$/i);

    await drawer.add('bridge');
    await h.driver.expect(h.driver.getByTestId('sidebar-nested-bridge')).toBeVisible();
    await drawer.expectInSidebar(/^games$/i);

    await drawer.remove('games');
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectInSidebar(/^bridge$/i);
    await h.driver.expect(drawer.folder('games')).toBeVisible();
  });

  test('the reset link clears every choice and goes away', async () => {
    await seedPins(h.member, { unpinned: ['games', 'people'], pinned: ['bridge'] });
    await h.loginAs(h.member);
    await drawer.goto();
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectNotInSidebar(/^people$/i);
    await drawer.expectInSidebar(/^bridge$/i);

    await drawer.reset();
    await drawer.expectInSidebar(/^games$/i);
    await drawer.expectInSidebar(/^people$/i);
    await drawer.expectNotInSidebar(/^bridge$/i);
  });

  test('search narrows both lists without touching the sidebar', async () => {
    await h.loginAs(h.member);
    await drawer.goto();

    await drawer.search('gift');
    await drawer.expectInLeft('gift-cards');
    await drawer.expectAbsent('people');
    await drawer.expectInSidebar(/people/i);

    // A child matches through its parent too.
    await drawer.search('bridge');
    await drawer.expectInRight('bridge');
    await drawer.expectInLeft('games');

    await drawer.search('zzz-nothing');
    await h.driver.expect(h.driver.getByTestId('sidebar-lists-left-empty')).toBeVisible();
    await h.driver.expect(h.driver.getByTestId('sidebar-lists-right-empty')).toBeVisible();
  });

  test('Superuser and Settings are fixed: always in the sidebar, never in the drawer', async () => {
    // Even a stored unpin can't remove them.
    await seedPins(h.admin, { unpinned: ['superuser', 'settings'] });
    await h.loginAs(h.admin);
    await drawer.goto();
    await drawer.expectInLeft('gift-cards');
    await drawer.expectAbsent('superuser');
    await drawer.expectAbsent('settings');
    // Configuration apps stay on the Superuser landing, not in the lists.
    await drawer.expectAbsent('flag-management');
    await drawer.expectAbsent('sidebar-defaults');
    await drawer.expectInSidebar(/^superuser$/i);
    await drawer.expectInSidebar(/^settings$/i);
  });

  test('a member cannot lose Settings either', async () => {
    await seedPins(h.member, { unpinned: ['settings'] });
    await h.loginAs(h.member);
    await drawer.goto();
    await drawer.expectAbsent('settings');
    await drawer.expectInSidebar(/^settings$/i);
  });
});

describe('Sidebar defaults', () => {
  let h: Harness;
  let drawer: AppDrawerPage;
  let defaults: SidebarDefaultsPage;

  beforeEach(async () => {
    h = await bootHomestead();
    drawer = new AppDrawerPage(h.driver);
    defaults = new SidebarDefaultsPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('a superuser changes a default and a member who chose nothing follows it', async () => {
    await h.loginAs(h.admin);
    await defaults.goto();
    await h.driver.expect(defaults.page).toBeVisible();
    await defaults.expectInLeft('games');
    await defaults.remove('games');
    await defaults.add('bridge');

    // Sam has chosen nothing, so the household default decides their sidebar.
    await h.loginAs(h.householdMember);
    await drawer.goto();
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectInSidebar(/^bridge$/i);
    await drawer.expectInRight('games');

    // Choosing for themselves records an override over the default.
    await drawer.add('games');
    await drawer.expectInSidebar(/^games$/i);
    await h.driver.expect(drawer.resetLink).toBeVisible();
  });

  test("a member's own choice survives a household default against it", async () => {
    await seedDefaults(h.admin.token, { games: false });
    await seedPins(h.member, { pinned: ['games'] });
    await h.loginAs(h.member);
    await drawer.goto();
    await drawer.expectInSidebar(/^games$/i);

    // Reset drops the choice, and the household default takes over.
    await drawer.reset();
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectInRight('games');
  });
});
