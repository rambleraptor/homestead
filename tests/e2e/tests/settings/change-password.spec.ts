/**
 * Settings E2E Tests - Change Password
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { SettingsPage } from '../../pages/SettingsPage';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';

test.describe('Change Password', () => {
  let settingsPage: SettingsPage;
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    settingsPage = new SettingsPage(authenticatedPage);
    loginPage = new LoginPage(authenticatedPage);
    dashboardPage = new DashboardPage(authenticatedPage);

    await settingsPage.goto();
  });

  test('should reject incorrect current password', async ({ testUser }) => {
    await settingsPage.changePassword('WrongCurrentPassword123!', 'NewPassword123!');

    // Should show error
    await settingsPage.expectPasswordChangeError(/current password|incorrect/i);
  });

  test('should reject mismatched new passwords', async ({ testUser }) => {
    await settingsPage.changePassword(
      testUser.password,
      'NewPassword123!',
      'DifferentPassword123!'
    );

    // Should show error
    await settingsPage.expectPasswordChangeError(/match|confirm/i);
  });

  test('should reject weak password', async ({ testUser }) => {
    await settingsPage.changePassword(testUser.password, 'weak');

    // Should show error about password requirements
    await settingsPage.expectPasswordChangeError(/password.*must|too weak|invalid/i);
  });
});
