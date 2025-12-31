/**
 * Dashboard Page Object Model
 */

import { Page, expect } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard');
  }

  async expectToBeOnDashboard() {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }

  async expectWelcomeMessage() {
    await expect(this.page.getByText(/welcome/i).or(this.page.getByRole('heading', { level: 1 }))).toBeVisible();
  }

  async logout() {
    // Use data-testid for reliable selection (preferred method)
    const logoutButton = this.page.getByTestId('logout-button');
    // Use force: true to bypass Next.js dev overlay that may intercept clicks
    await logoutButton.click({ force: true });
    // Wait for logout to redirect to login page
    await this.page.waitForURL(/\/login/, { timeout: 10000 });
  }

  async navigateToModule(moduleName: string | RegExp) {
    await this.page.getByRole('navigation').getByRole('link', { name: moduleName }).click();
  }
}
