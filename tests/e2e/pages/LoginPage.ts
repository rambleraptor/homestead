/**
 * Login Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class LoginPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/login');
    // Wait for the page to be fully loaded and hydrated
    await this.driver.waitForNetworkIdle();
  }

  async login(email: string, password: string) {
    // Wait for the email field to be stable before interacting
    const emailField = this.driver.getByLabel(/email/i);
    await emailField.waitFor({ state: 'visible' });
    await emailField.fill(email);

    const passwordField = this.driver.getByLabel(/password/i);
    await passwordField.waitFor({ state: 'visible' });
    await passwordField.fill(password);

    // Click login button and wait for navigation or error
    const loginButton = this.driver.getByRole('button', { name: /login|sign in/i });
    await loginButton.click();

    // Wait for the async login to complete
    // The page will either redirect (success) or show an error (failure)
    await this.driver.waitForNetworkIdle();
  }

  async expectLoginError(message?: string | RegExp) {
    // Find the error container and then the text element inside it
    // The structure is: div > (SVG icon + p tag with text)
    const errorContainer = this.driver.locator('.bg-red-50.border-red-200').first();
    await this.expect(errorContainer).toBeVisible();

    if (message) {
      // Find the p tag with the actual error text
      const errorText = errorContainer.locator('p.text-red-600');
      await this.expect(errorText).toContainText(message);
    }
  }

  async expectToBeOnLoginPage() {
    await this.driver.expectURL(/\/login/);
  }
}
