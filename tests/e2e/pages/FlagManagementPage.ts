/**
 * Flag Management Page Object Model
 *
 * Drives the superuser-only /superuser/flag-management surface that
 * lists every declared app flag and lets an operator flip values.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class FlagManagementPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/superuser/flag-management');
  }

  async expectToBeOnFlagManagementPage() {
    await this.driver.expectURL(/\/superuser\/flag-management$/);
    await this.expect(
      this.driver.getByRole('heading', { name: 'Flag Management', level: 1 }),
    ).toBeVisible();
  }

  async expectAppSectionVisible(appId: string) {
    await this.expect(this.driver.getByTestId(`flag-app-${appId}`)).toBeVisible();
  }

  async expectFlagDescriptionVisible(description: string) {
    await this.expect(this.driver.getByText(description).first()).toBeVisible();
  }

  async selectEnumFlag(appId: string, key: string, value: string) {
    const control = this.driver.getByTestId(`flag-${appId}-${key}`);
    await control.waitFor({ state: 'visible' });
    await control.selectOption(value);
  }

  async expectEnumFlagValue(appId: string, key: string, value: string) {
    const control = this.driver.getByTestId(`flag-${appId}-${key}`);
    await this.expect(control).toHaveValue(value);
  }
}
