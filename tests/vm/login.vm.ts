/**
 * Authentication - Login, on the VM tier.
 *
 * A port of tests/e2e/tests/auth/login.spec.ts: the same page objects drive
 * the real login form, with the SPA in happy-dom against the server's
 * in-process fetch handler. Each test boots from a fresh copy of the template
 * database, unauthenticated (on /login).
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { LoginPage } from '../e2e/pages/LoginPage';
import { DashboardPage } from '../e2e/pages/DashboardPage';

describe('Login', () => {
  let h: Harness;
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  beforeEach(async () => {
    h = await bootHomestead();
    loginPage = new LoginPage(h.driver);
    dashboardPage = new DashboardPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('should login with valid credentials', async () => {
    await loginPage.goto();
    await loginPage.login(h.member.email, h.member.password);

    // Should redirect to dashboard
    await dashboardPage.expectToBeOnDashboard();
  });

  test('should show error with invalid email', async () => {
    await loginPage.goto();
    await loginPage.login('wrong@test.local', h.member.password);

    // Should show error
    await loginPage.expectLoginError(/invalid|incorrect|failed/i);
  });

  test('should show error with invalid password', async () => {
    await loginPage.goto();
    await loginPage.login(h.member.email, 'WrongPassword123!');

    // Should show error
    await loginPage.expectLoginError(/invalid|incorrect|failed/i);
  });

  test('should remain on login page after failed login', async () => {
    await loginPage.goto();
    await loginPage.login(h.member.email, 'WrongPassword123!');

    // Should still be on login page
    await loginPage.expectToBeOnLoginPage();
  });
});
