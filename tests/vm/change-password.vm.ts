/**
 * Settings - Change Password, on the VM tier.
 *
 * A port of tests/e2e/tests/settings/change-password.spec.ts, driven through
 * the shared SettingsPage as the template's member.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { SettingsPage } from '../e2e/pages/SettingsPage';

describe('Change Password', () => {
  let h: Harness;
  let settingsPage: SettingsPage;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
    settingsPage = new SettingsPage(h.driver);

    await settingsPage.goto();
  });

  afterEach(async () => {
    await h.close();
  });

  test('should reject incorrect current password', async () => {
    await settingsPage.changePassword('WrongCurrentPassword123!', 'NewPassword123!');

    // Should show error
    await settingsPage.expectPasswordChangeError(/current password|incorrect/i);
  });

  test('should reject mismatched new passwords', async () => {
    await settingsPage.changePassword(h.member.password, 'NewPassword123!', 'DifferentPassword123!');

    // Should show error
    await settingsPage.expectPasswordChangeError(/match|confirm/i);
  });

  test('should reject weak password', async () => {
    await settingsPage.changePassword(h.member.password, 'weak');

    // Should show error about password requirements
    await settingsPage.expectPasswordChangeError(/password.*must|too weak|invalid/i);
  });

  test('should change the password and keep this session working', async () => {
    await settingsPage.changePassword(h.member.password, 'RotatedPassword456!');
    await settingsPage.expectPasswordChangeSuccess();

    // Changing the password revokes every session minted under the old one,
    // including this tab's — the server issues a replacement, which the client
    // stores. If that hand-off were broken the next authenticated fetch would
    // 401 and this panel would never render. (That the old password stops
    // working, and that other devices are signed out, is covered by the auth
    // route tests, which can inspect the token store directly.)
    await settingsPage.expectSessionStillAuthenticates();
  });
});

describe('Sign out everywhere', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
  });

  afterEach(async () => {
    await h.close();
  });

  test('revokes other sessions while keeping this one', async () => {
    const settingsPage = new SettingsPage(h.driver);
    await settingsPage.goto();

    await settingsPage.signOutEverywhere();
    await settingsPage.expectSignOutEverywhereSuccess();

    // Same hand-off as above: other sessions are gone, this one was replaced.
    await settingsPage.expectSessionStillAuthenticates();
  });
});
