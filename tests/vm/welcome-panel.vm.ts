/**
 * The classic dashboard's first-login welcome panel, on the VM tier.
 *
 * The template's member has never visited, so with the classic dashboard they
 * should see the getting-started guide on their first visit, be able to dismiss it, and never see it again — including
 * after a full reload, which proves the dismissal persisted to the user's
 * preference record.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../e2e/pages/DashboardPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';

describe('Dashboard welcome panel', () => {
  let h: Harness;
  let dashboardPage: DashboardPage;

  beforeEach(async () => {
    h = await bootHomestead();
    await e2eClient(h.admin.token).collection('app-flags').create({ dashboard__classic_home: true });
    await h.loginAs(h.member);
    dashboardPage = new DashboardPage(h.driver);
    await dashboardPage.goto();
    await dashboardPage.expectToBeOnDashboard();
  });

  afterEach(async () => {
    await h.close();
  });

  test('shows the welcome guide to a brand-new user', async () => {
    await h.driver.expect(dashboardPage.welcomePanel).toBeVisible();
    await h.driver.expect(dashboardPage.welcomePanel).toContainText(/welcome to homestead/i);
  });

  test('dismissal hides the guide and persists across a reload', async () => {
    await h.driver.expect(dashboardPage.welcomePanel).toBeVisible();

    await dashboardPage.dismissWelcome();
    await h.driver.expect(dashboardPage.welcomePanel).toBeHidden();

    await h.driver.reload();
    await dashboardPage.expectToBeOnDashboard();
    await h.driver.expect(dashboardPage.welcomePanel).toBeHidden();
  });
});
