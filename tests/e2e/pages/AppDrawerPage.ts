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

  pinButton(appId: string) {
    return this.driver.getByTestId(`app-drawer-pin-${appId}`);
  }

  /** Toggle an app's pin and wait for the saved state to come back. */
  async togglePin(appId: string) {
    const before = await this.pinButton(appId).getAttribute('aria-pressed');
    await this.pinButton(appId).click();
    await this.expect(this.pinButton(appId)).toHaveAttribute(
      'aria-pressed',
      before === 'true' ? 'false' : 'true',
    );
  }

  get summary() {
    return this.driver.getByTestId('app-drawer-summary');
  }

  get resetButton() {
    return this.driver.getByTestId('app-drawer-reset');
  }

  async reset() {
    await this.resetButton.click();
    await this.expect(this.resetButton).toHaveCount(0);
  }

  async search(text: string) {
    await this.driver.getByTestId('app-drawer-search').fill(text);
  }

  async expectPinned(appId: string, pinned: boolean) {
    await this.expect(this.pinButton(appId)).toHaveAttribute('aria-pressed', String(pinned));
  }

  /** The superuser-only mode switch; absent for everyone else. */
  get defaultsModeTab() {
    return this.driver.getByTestId('app-drawer-mode-defaults');
  }

  async switchToDefaults() {
    await this.defaultsModeTab.click();
    await this.expect(this.defaultsModeTab).toHaveAttribute('aria-selected', 'true');
  }

  async switchToMine() {
    await this.driver.getByTestId('app-drawer-mode-mine').click();
    await this.expect(this.driver.getByTestId('app-drawer-summary')).toBeVisible();
  }

  defaultSwitch(appId: string) {
    return this.driver.getByTestId(`app-drawer-default-${appId}`);
  }

  /** Toggle an app's household default and wait for the saved state. */
  async toggleDefault(appId: string) {
    const before = await this.defaultSwitch(appId).getAttribute('aria-checked');
    await this.defaultSwitch(appId).click();
    await this.expect(this.defaultSwitch(appId)).toHaveAttribute(
      'aria-checked',
      before === 'true' ? 'false' : 'true',
    );
  }

  get defaultSummary() {
    return this.driver.getByTestId('app-drawer-default-summary');
  }

  /** The "A new member's sidebar" preview entry for an app. */
  previewEntry(appId: string) {
    return this.driver.getByTestId(`app-drawer-preview-${appId}`);
  }

  tag(appId: string) {
    return this.driver.getByTestId(`app-drawer-tag-${appId}`);
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
