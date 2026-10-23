/**
 * Settings Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class SettingsPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/settings');
  }

  async expectToBeOnSettingsPage() {
    await this.driver.expectURL(/\/settings/);
  }

  async changePassword(currentPassword: string, newPassword: string, confirmPassword?: string) {
    await this.driver.getByLabel(/current password|old password/i).fill(currentPassword);
    await this.driver.getByLabel(/^new password/i).fill(newPassword);
    await this.driver.getByLabel(/confirm password|confirm new password/i).fill(confirmPassword || newPassword);
    await this.driver.getByRole('button', { name: /change password|update password/i }).click();
  }

  async expectPasswordChangeSuccess() {
    // Sonner toast with success message
    // Toasts typically appear with data attributes like [data-sonner-toast]
    // and contain the success text "Password changed successfully"
    const successToast = this.driver.getByText(/password.*changed.*successfully/i);
    await this.expect(successToast).toBeVisible({ timeout: 5000 });
  }

  async expectPasswordChangeError(message?: string | RegExp) {
    // Error can appear either as inline error or as toast
    // Inline error: <div className="p-3 text-sm bg-red-50/20 text-red-600 rounded-md">
    // Toast error: Sonner toast with error type

    if (message) {
      // Look for text matching the error message pattern
      const errorText = this.driver.getByText(message).first();
      await this.expect(errorText).toBeVisible({ timeout: 5000 });
    } else {
      // Look for any error indicator
      const errorElement = this.driver.locator('.text-red-600, [data-type="error"]').first();
      await this.expect(errorElement).toBeVisible({ timeout: 5000 });
    }
  }

  /**
   * Open the Connections tab and wait for its personal-access-token list to
   * load. That list is fetched with the session's bearer token, so a successful
   * render is evidence the session still authenticates — checkable without a
   * navigation, which matters after a credential rotation.
   */
  async expectSessionStillAuthenticates() {
    await this.driver.getByTestId('settings-tab-connections').click();
    await this.expect(this.driver.getByTestId('settings-connections')).toBeVisible();
    await this.expect(this.driver.getByRole('heading', { name: /personal access tokens/i })).toBeVisible({
      timeout: 10000,
    });
  }

  /**
   * "Sign out everywhere" — revokes the user's other sessions. The server hands
   * back a fresh session for this tab, so the page stays signed in.
   */
  async signOutEverywhere() {
    await this.driver.getByTestId('sign-out-everywhere').click();
    // The confirm dialog's own button carries the same label.
    await this.driver
      .getByRole('button', { name: /^sign out everywhere$/i })
      .last()
      .click();
  }

  async expectSignOutEverywhereSuccess() {
    await this.expect(this.driver.getByText(/signed out on all other devices/i)).toBeVisible({
      timeout: 5000,
    });
  }

  /**
   * Per-user "map provider" setting, declared by the People app and
   * rendered through the auto-generated form in the App Settings
   * section of the Settings page.
   */
  async selectMapProvider(provider: 'google' | 'apple') {
    const select = this.driver.getByTestId('user-setting-people-map_provider');
    // The change handler persists the value to the user's `preferences`
    // record. Wait for that write to land so a subsequent reload reads the
    // saved value rather than racing the in-flight save.
    const saved = this.driver.waitForResponse(
      (r) => /\/preferences(\/|\?|$)/.test(r.url) && ['POST', 'PATCH'].includes(r.method) && r.ok,
    );
    await select.selectOption(provider);
    await saved;
  }

  async expectMapProvider(provider: 'google' | 'apple') {
    const select = this.driver.getByTestId('user-setting-people-map_provider');
    await this.expect(select).toHaveValue(provider);
  }
}
