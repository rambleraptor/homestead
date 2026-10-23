/**
 * Dashboard — admin getting-started checklist, on the VM tier.
 *
 * A port of tests/e2e/tests/dashboard/admin-checklist.spec.ts. A superuser
 * lands on the dashboard and sees the post-claim checklist (in place of the
 * generic welcome guide), with its two setup steps and a link into the Users
 * admin. Done-state is data-dependent (how many users exist, whether AI is
 * configured), so we assert the steps render rather than their checked state.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../e2e/pages/DashboardPage';

describe('Dashboard admin checklist', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.admin);
  });

  afterEach(async () => {
    await h.close();
  });

  test('shows the getting-started checklist to the admin', async () => {
    const dashboard = new DashboardPage(h.driver);
    await dashboard.goto();
    await dashboard.expectToBeOnDashboard();

    await h.driver.expect(dashboard.adminChecklist).toBeVisible();
    await h.driver.expect(h.driver.getByTestId('checklist-item-members')).toBeVisible();
    await h.driver.expect(h.driver.getByTestId('checklist-item-ai')).toBeVisible();
    await h.driver
      .expect(h.driver.getByTestId('checklist-link-members'))
      .toHaveAttribute('href', '/superuser/users');
  });
});
