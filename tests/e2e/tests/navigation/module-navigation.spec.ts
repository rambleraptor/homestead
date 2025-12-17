/**
 * Navigation E2E Tests - Module Navigation
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { DashboardPage } from '../../pages/DashboardPage';

test.describe('Module Navigation', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    dashboardPage = new DashboardPage(authenticatedPage);
    await dashboardPage.goto();
  });

  test('should navigate to Gift Cards module', async ({ authenticatedPage }) => {
    await dashboardPage.navigateToModule(/gift card/i);
    await expect(authenticatedPage).toHaveURL(/\/gift-cards/);
  });

  test('should navigate to Events module', async ({ authenticatedPage }) => {
    await dashboardPage.navigateToModule(/event/i);
    await expect(authenticatedPage).toHaveURL(/\/events/);
  });

  test('should navigate to Settings module', async ({ authenticatedPage }) => {
    await dashboardPage.navigateToModule(/setting/i);
    await expect(authenticatedPage).toHaveURL(/\/settings/);
  });

  test('should navigate between modules', async ({ authenticatedPage }) => {
    // Start at dashboard
    await dashboardPage.expectToBeOnDashboard();

    // Go to gift cards
    await dashboardPage.navigateToModule(/gift card/i);
    await expect(authenticatedPage).toHaveURL(/\/gift-cards/);

    // Go to events
    await authenticatedPage.getByRole('navigation').getByRole('link', { name: /event/i }).click();
    await expect(authenticatedPage).toHaveURL(/\/events/);

    // Go to settings
    await authenticatedPage.getByRole('navigation').getByRole('link', { name: /setting/i }).click();
    await expect(authenticatedPage).toHaveURL(/\/settings/);

    // Go back to dashboard
    await authenticatedPage.getByRole('navigation').getByRole('link', { name: /dashboard|home/i }).click();
    await dashboardPage.expectToBeOnDashboard();
  });

  test('should show 404 for invalid routes', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/this-route-does-not-exist');

    // Should show 404 or Not Found
    await expect(
      authenticatedPage.getByText(/not found|404/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('should redirect root to dashboard', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');

    // Should redirect to dashboard
    await dashboardPage.expectToBeOnDashboard();
  });
});
