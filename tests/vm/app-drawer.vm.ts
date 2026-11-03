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
import { e2eClient, setAppFlag } from '../e2e/utils/aepbase-helpers';

/** Seed sidebar pins on `user`'s preference record, as the user. */
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

async function unpinApps(user: { id: string; token: string }, appIds: string[]) {
  await seedPins(user, { unpinned: appIds });
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

  test('unpinning from the drawer removes the app from the sidebar, and pinning restores it', async () => {
    await h.loginAs(h.member);
    await drawer.goto();
    await drawer.expectInSidebar(/^games$/i);
    await drawer.expectPinned('games', true);

    await drawer.togglePin('games');
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectCard('games');

    // The choice is on the record, so a fresh load reads the same sidebar.
    await h.driver.reload();
    await drawer.expectPinned('games', false);
    await drawer.expectNotInSidebar(/^games$/i);

    await drawer.togglePin('games');
    await drawer.expectInSidebar(/^games$/i);
  });

  test('the summary counts pins, and reset clears every override', async () => {
    await unpinApps(h.member, ['games', 'people']);
    await h.loginAs(h.member);
    await drawer.goto();

    await h.driver.expect(drawer.summary).toContainText(/^\d+ of \d+ in your sidebar$/);
    const before = (await drawer.summary.textContent()) ?? '';
    const [pinnedCount, total] = before.match(/\d+/g)!.map(Number);
    if (pinnedCount !== total - 2) {
      throw new Error(`expected ${total - 2} pinned of ${total}, got: ${before}`);
    }
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectNotInSidebar(/^people$/i);

    await drawer.reset();
    await h.driver.expect(drawer.summary).toHaveText(`${total} of ${total} in your sidebar`);
    await drawer.expectInSidebar(/^games$/i);
    await drawer.expectInSidebar(/^people$/i);
  });

  test('search narrows the drawer without touching the sidebar', async () => {
    await h.loginAs(h.member);
    await drawer.goto();

    await drawer.search('gift');
    await drawer.expectCard('gift-cards');
    await drawer.expectNoCard('people');
    await drawer.expectInSidebar(/people/i);

    await drawer.search('zzz-nothing');
    await h.driver.expect(h.driver.getByTestId('app-drawer-no-matches')).toBeVisible();
  });

  test('a member has no household-defaults mode', async () => {
    await h.loginAs(h.member);
    await drawer.goto();
    await drawer.expectCard('people');
    await h.driver.expect(drawer.defaultsModeTab).toHaveCount(0);
  });

  test('a superuser changes a household default and a new member follows it', async () => {
    await h.loginAs(h.admin);
    await drawer.goto();
    await drawer.switchToDefaults();
    await h.driver.expect(drawer.previewEntry('games')).toBeVisible();

    await drawer.toggleDefault('games');
    await h.driver.expect(drawer.previewEntry('games')).toHaveCount(0);
    await h.driver.expect(drawer.defaultSummary).toContainText(/^\d+ of \d+ in the sidebar by default$/);

    // Sam has chosen nothing, so the household default decides their sidebar.
    await h.loginAs(h.householdMember);
    await drawer.goto();
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectCard('games');
    await drawer.expectPinned('games', false);
    await h.driver.expect(drawer.tag('games')).toHaveCount(0);

    // Pinning it for themselves records an override over the default.
    await drawer.togglePin('games');
    await drawer.expectInSidebar(/^games$/i);
    await h.driver.expect(drawer.tag('games')).toHaveText('Pinned by you');
  });

  test("a member's own pin survives a household default against it", async () => {
    await seedDefaults(h.admin.token, { games: false });
    await seedPins(h.member, { pinned: ['games'] });
    await h.loginAs(h.member);
    await drawer.goto();

    await drawer.expectInSidebar(/^games$/i);
    await h.driver.expect(drawer.tag('games')).toHaveText('Pinned by you');

    // Reset drops the override, and the household default takes over.
    await drawer.reset();
    await drawer.expectNotInSidebar(/^games$/i);
    await drawer.expectCard('games');
  });

  test('the superuser sees their own apps in the drawer', async () => {
    await h.loginAs(h.admin);
    await drawer.goto();
    await drawer.expectCard('superuser');
    await drawer.expectCard('gift-cards');
  });
});
