/**
 * Authentication - Logout, on the VM tier.
 *
 * A port of tests/e2e/tests/auth/logout.spec.ts. The member signs in through
 * the real login form (as the Playwright `authenticatedPage` fixture does),
 * then logs out via the sidebar.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../e2e/pages/DashboardPage';
import { LoginPage } from '../e2e/pages/LoginPage';

describe('Logout', () => {
  let h: Harness;
  let dashboardPage: DashboardPage;
  let loginPage: LoginPage;

  beforeEach(async () => {
    h = await bootHomestead();
    dashboardPage = new DashboardPage(h.driver);
    loginPage = new LoginPage(h.driver);
    await h.loginAs(h.member, { via: 'form' });
  });

  afterEach(async () => {
    await h.close();
  });

  test('should logout and redirect to login', async () => {
    await dashboardPage.expectToBeOnDashboard();

    await dashboardPage.logout();

    // Should redirect to login page
    await loginPage.expectToBeOnLoginPage();
  });

  test('should not be able to access protected pages after logout', async () => {
    await dashboardPage.logout();

    // Try to access protected page
    await h.driver.goto('/gift-cards');

    // Should redirect to login
    await loginPage.expectToBeOnLoginPage();
  });
});
