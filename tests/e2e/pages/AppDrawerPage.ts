/**
 * App Drawer Page Object Model
 *
 * The `/apps` page listing every app the viewer can use, and the sidebar's
 * fixed "All apps" entry that opens it. Written against the shared `Driver`,
 * so it drives both the Playwright suite and the in-process VM tier.
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class AppDrawerPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/apps');
  }

  /** The sidebar's fixed entry, outside the pinned sections. */
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

  card(appId: string) {
    return this.driver.getByTestId(`app-drawer-card-${appId}`);
  }

  /** A sidebar link for an app, by its visible name. */
  sidebarApp(name: string | RegExp) {
    return this.driver.getByRole('navigation').getByRole('link', { name });
  }

  async expectCard(appId: string) {
    await this.expect(this.card(appId)).toBeVisible();
  }

  async expectNoCard(appId: string) {
    await this.expect(this.card(appId)).toHaveCount(0);
  }

  async expectInSidebar(name: string | RegExp) {
    await this.expect(this.sidebarApp(name)).toBeVisible();
  }

  async expectNotInSidebar(name: string | RegExp) {
    await this.expect(this.sidebarApp(name)).toHaveCount(0);
  }
}
