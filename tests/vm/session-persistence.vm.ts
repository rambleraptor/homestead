/**
 * Authentication - Session Persistence, on the VM tier.
 *
 * A port of tests/e2e/tests/auth/session-persistence.spec.ts. A reload in the
 * VM remounts the app with localStorage (and so the session) kept, as a
 * browser reload does.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../e2e/pages/DashboardPage';
import { LoginPage } from '../e2e/pages/LoginPage';

describe('Session Persistence', () => {
  let h: Harness;
  let dashboardPage: DashboardPage;
  let loginPage: LoginPage;

  beforeEach(async () => {
    h = await bootHomestead();
    dashboardPage = new DashboardPage(h.driver);
    loginPage = new LoginPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('should persist session across page reloads', async () => {
    await h.loginAs(h.member, { via: 'form' });
    await dashboardPage.expectToBeOnDashboard();

    // Reload the page
    await h.driver.reload();

    // Should still be authenticated and on dashboard
    await dashboardPage.expectToBeOnDashboard();
  });

  test('should persist session when navigating to different pages', async () => {
    await h.loginAs(h.member, { via: 'form' });
    await dashboardPage.expectToBeOnDashboard();

    // Navigate to gift cards
    await h.driver.goto('/gift-cards');
    await h.driver.expectURL(/\/gift-cards/);

    // Navigate to events
    await h.driver.goto('/events');
    await h.driver.expectURL(/\/events/);

    // Should still be authenticated - navigate back to dashboard
    await h.driver.goto('/dashboard');
    await dashboardPage.expectToBeOnDashboard();
  });

  test('should redirect unauthenticated users to login', async () => {
    // Try to access protected page without logging in
    await h.driver.goto('/dashboard');

    // Should redirect to login
    await loginPage.expectToBeOnLoginPage();
  });

  test('should redirect to dashboard from login if already authenticated', async () => {
    await h.loginAs(h.member, { via: 'form' });

    // Already authenticated, try to go to login
    await h.driver.goto('/login');

    // Should redirect to dashboard
    await dashboardPage.expectToBeOnDashboard();
  });
});
