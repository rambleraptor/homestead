/**
 * Authentication E2E Tests - Session Persistence
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { DashboardPage } from '../../pages/DashboardPage';
import { LoginPage } from '../../pages/LoginPage';

test.describe('Session Persistence', () => {
  let dashboardPage: DashboardPage;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    loginPage = new LoginPage(page);
  });

  test('should persist session across page reloads', async ({ authenticatedPage }) => {
    await dashboardPage.expectToBeOnDashboard();

    // Reload the page
    await authenticatedPage.reload();

    // Should still be authenticated and on dashboard
    await dashboardPage.expectToBeOnDashboard();
  });

  test('should persist session when navigating to different pages', async ({ authenticatedPage }) => {
    await dashboardPage.expectToBeOnDashboard();

    // Navigate to gift cards
    await authenticatedPage.goto('/gift-cards');
    await expect(authenticatedPage).toHaveURL(/\/gift-cards/);

    // Navigate to events
    await authenticatedPage.goto('/events');
    await expect(authenticatedPage).toHaveURL(/\/events/);

    // Should still be authenticated - navigate back to dashboard
    await authenticatedPage.goto('/dashboard');
    await dashboardPage.expectToBeOnDashboard();
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access protected page without logging in
    await page.goto('/dashboard');

    // Should redirect to login
    await loginPage.expectToBeOnLoginPage();
  });

  test('should redirect to dashboard from login if already authenticated', async ({ authenticatedPage }) => {
    // Already authenticated, try to go to login
    await authenticatedPage.goto('/login');

    // Should redirect to dashboard
    await dashboardPage.expectToBeOnDashboard();
  });
});
