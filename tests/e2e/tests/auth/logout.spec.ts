/**
 * Authentication E2E Tests - Logout
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { DashboardPage } from '../../pages/DashboardPage';
import { LoginPage } from '../../pages/LoginPage';

test.describe('Logout', () => {
  let dashboardPage: DashboardPage;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    loginPage = new LoginPage(page);
  });

  test('should logout and redirect to login', async ({ authenticatedPage }) => {
    await dashboardPage.expectToBeOnDashboard();

    await dashboardPage.logout();

    // Should redirect to login page
    await loginPage.expectToBeOnLoginPage();
  });

  test('should not be able to access protected pages after logout', async ({ authenticatedPage }) => {
    await dashboardPage.logout();

    // Try to access protected page
    await authenticatedPage.goto('/gift-cards');

    // Should redirect to login
    await loginPage.expectToBeOnLoginPage();
  });
});
