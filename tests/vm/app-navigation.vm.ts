/**
 * Navigation - App Navigation, on the VM tier.
 *
 * A port of tests/e2e/tests/navigation/app-navigation.spec.ts: the sidebar
 * links and route fallbacks, driven through the shared DashboardPage.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../e2e/pages/DashboardPage';

describe('App Navigation', () => {
  let h: Harness;
  let dashboardPage: DashboardPage;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
    dashboardPage = new DashboardPage(h.driver);
    await dashboardPage.goto();
  });

  afterEach(async () => {
    await h.close();
  });

  test('should navigate to Gift Cards app', async () => {
    await dashboardPage.navigateToApp(/gift card/i);
    await h.driver.expectURL(/\/gift-cards/);
  });

  test('should navigate to People app', async () => {
    await dashboardPage.navigateToApp(/people/i);
    await h.driver.expectURL(/\/people/);
  });

  test('should navigate to Settings app', async () => {
    await dashboardPage.navigateToApp(/setting/i);
    await h.driver.expectURL(/\/settings/);
  });

  test('should navigate between apps', async () => {
    // Start at dashboard
    await dashboardPage.expectToBeOnDashboard();

    // Go to gift cards
    await dashboardPage.navigateToApp(/gift card/i);
    await h.driver.expectURL(/\/gift-cards/);

    // Go to people
    await h.driver.getByRole('navigation').getByRole('link', { name: /people/i }).click();
    await h.driver.expectURL(/\/people/);

    // Go to settings
    await h.driver.getByRole('navigation').getByRole('link', { name: /setting/i }).click();
    await h.driver.expectURL(/\/settings/);

    // Go back to dashboard via the Homestead brand link in the sidebar header.
    // (The Dashboard app was removed from the nav in favor of this link.)
    await h.driver.getByTestId('sidebar-home-link').click();
    await dashboardPage.expectToBeOnDashboard();
  });

  test('should show 404 for invalid routes', async () => {
    await h.driver.goto('/this-route-does-not-exist');

    // Should show 404 or Not Found
    await h.driver.expect(h.driver.getByText(/not found|404/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should redirect root to dashboard', async () => {
    await h.driver.goto('/');

    // Should redirect to dashboard
    await dashboardPage.expectToBeOnDashboard();
  });
});
