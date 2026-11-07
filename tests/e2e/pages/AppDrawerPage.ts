/**
 * App Drawer Page Object Model
 *
 * The `/apps` page: two lists, "Your sidebar" and "More apps", with one
 * button moving an entry between them; and the sidebar's fixed "All apps"
 * entry that opens it. The superuser's Sidebar defaults page uses the same
 * two lists, so `SidebarDefaultsPage` below shares the helpers.
 *
 * Written against the shared `Driver`, so it drives both the Playwright
 * suite and the in-process VM tier.
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class SidebarListsPage {
  constructor(readonly driver: Driver) {}

  protected expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  /** The "open" link of an entry, in whichever list it sits. */
  open(appId: string) {
    return this.driver.getByTestId(`app-drawer-open-${appId}`);
  }

  /** An entry's row in the left list. */
  row(appId: string) {
    return this.driver.getByTestId(`app-drawer-row-${appId}`);
  }

  /** An entry's tile in the right list (a parent with children is a folder). */
  tile(appId: string) {
    return this.driver.getByTestId(`app-drawer-tile-${appId}`);
  }

  folder(appId: string) {
    return this.driver.getByTestId(`app-drawer-folder-${appId}`);
  }

  /** Move an entry into the left list and wait for it to land. */
  async add(appId: string) {
    await this.driver.getByTestId(`app-drawer-add-${appId}`).click();
    await this.expect(this.row(appId)).toBeVisible();
  }

  /** Move an entry out of the left list and wait for it to land. */
  async remove(appId: string) {
    await this.driver.getByTestId(`app-drawer-remove-${appId}`).click();
    await this.expect(this.row(appId)).toHaveCount(0);
  }

  async expectInLeft(appId: string) {
    await this.expect(this.row(appId)).toBeVisible();
  }

  async expectInRight(appId: string) {
    await this.expect(this.tile(appId).or(this.folder(appId))).toBeVisible();
  }

  async expectAbsent(appId: string) {
    await this.expect(this.open(appId)).toHaveCount(0);
  }

  /** A sidebar link for an app, by its visible name. */
  sidebarApp(name: string | RegExp) {
    return this.driver.getByRole('navigation').getByRole('link', { name });
  }

  async expectInSidebar(name: string | RegExp) {
    await this.expect(this.sidebarApp(name)).toBeVisible();
  }

  async expectNotInSidebar(name: string | RegExp) {
    await this.expect(this.sidebarApp(name)).toHaveCount(0);
  }
}

export class AppDrawerPage extends SidebarListsPage {
  async goto() {
    await this.driver.goto('/apps');
  }

  /** The sidebar's fixed entry, outside the sections. */
  get sidebarLink() {
    return this.driver.getByTestId('sidebar-all-apps-link');
  }

  async openFromSidebar() {
    await this.sidebarLink.click();
    await this.driver.expectURL(/\/apps$/);
  }

  get drawer() {
    return this.driver.getByTestId('app-drawer');
  }

  get resetLink() {
    return this.driver.getByTestId('app-drawer-reset');
  }

  /** The "Add to your Home Screen" section. */
  get homeScreenSection() {
    return this.driver.getByTestId('app-drawer-home-screen');
  }

  /** One app's "Add" button in that section. */
  homeScreenAdd(appId: string) {
    return this.driver.getByTestId(`home-screen-add-${appId}`);
  }

  /** The guide an app's page shows when opened with `?install`. */
  get installGuide() {
    return this.driver.getByTestId('install-guide');
  }

  async reset() {
    await this.resetLink.click();
    await this.expect(this.resetLink).toHaveCount(0);
  }

  async search(text: string) {
    await this.driver.getByTestId('app-drawer-search').fill(text);
  }
}

export class SidebarDefaultsPage extends SidebarListsPage {
  async goto() {
    await this.driver.goto('/superuser/sidebar-defaults');
  }

  get page() {
    return this.driver.getByTestId('sidebar-defaults');
  }
}
