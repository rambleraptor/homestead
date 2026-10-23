/**
 * Superuser → Flag Management sub-page, on the VM tier.
 *
 * A port of tests/e2e/tests/flag-management/flag-management.spec.ts. Only
 * superusers may access /superuser/flag-management. These specs verify the
 * access gate and that declared flags render. Each test starts from a fresh
 * database, so there is no `app-flags` singleton to reset.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { FlagManagementPage } from '../e2e/pages/FlagManagementPage';

describe('Superuser → Flag Management sub-page (superuser)', () => {
  let h: Harness;
  let flagPage: FlagManagementPage;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.admin);
    flagPage = new FlagManagementPage(h.driver);
    await flagPage.goto();
    await flagPage.expectToBeOnFlagManagementPage();
  });

  afterEach(async () => {
    await h.close();
  });

  test('renders the groceries app section with its declared flags', async () => {
    // App audience is no longer a flag (it's governed by permissions); the page
    // now shows only each app's declared feature flags.
    await flagPage.expectAppSectionVisible('groceries');
  });
});

describe('Superuser → Flag Management sub-page (regular user gate)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
  });

  afterEach(async () => {
    await h.close();
  });

  test('nav does not expose the Superuser link for regular users', async () => {
    const link = h.driver.getByRole('link', { name: 'Superuser' });
    await h.driver.expect(link).toHaveCount(0);
  });

  test('direct navigation to /superuser/flag-management redirects regular users to /dashboard', async () => {
    await h.driver.goto('/superuser/flag-management');
    await h.driver.waitForURL('/dashboard', { timeout: 5000 });
    await h.driver.expectURL(/\/dashboard$/);
  });
});
