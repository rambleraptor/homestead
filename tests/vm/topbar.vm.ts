/**
 * Navigation - Top-bar apps, on the VM tier.
 *
 * A port of tests/e2e/tests/navigation/topbar.spec.ts. Apps with
 * `placement: 'topbar'` (notifications, chat) render as icon buttons in the
 * header instead of sidebar links.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../e2e/pages/DashboardPage';

describe('Top-bar apps', () => {
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

  test('header shows notifications and chat buttons', async () => {
    await h.driver.expect(h.driver.getByTestId('topbar-app-notifications')).toBeVisible();
    await h.driver.expect(h.driver.getByTestId('topbar-app-chat')).toBeVisible();
  });

  test('topbar apps do not appear in the sidebar', async () => {
    const nav = h.driver.getByRole('navigation');
    await h.driver.expect(nav.getByRole('link', { name: /notification/i })).toHaveCount(0);
    await h.driver.expect(nav.getByRole('link', { name: /^chat$/i })).toHaveCount(0);
  });

  test('notifications button navigates to /notifications', async () => {
    await h.driver.getByTestId('topbar-app-notifications').click();
    await h.driver.expectURL(/\/notifications/);
  });

  test('chat button navigates to /chat and renders the app', async () => {
    await h.driver.getByTestId('topbar-app-chat').click();
    await h.driver.expectURL(/\/chat/);
    // The page renders without a GEMINI key — the 503 only happens on send.
    await h.driver.expect(h.driver.getByTestId('chat-input')).toBeVisible();
  });
});
