/**
 * PocketBase Fixture for E2E Tests
 *
 * Provides authenticated PocketBase client and page to tests
 */

import { test as base, Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { getPocketBaseUrl } from '../config/pocketbase.setup';
import { testUsers } from './test-data';

type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
};

type PocketBaseFixtures = {
  pocketbase: PocketBase;
  testUser: TestUser;
  authenticatedPage: Page;
};

/**
 * Extended test with PocketBase fixtures
 */
export const test = base.extend<PocketBaseFixtures>({
  /**
   * PocketBase client instance (authenticated as admin)
   */
  pocketbase: async ({}, use) => {
    const pb = new PocketBase(getPocketBaseUrl());

    // Authenticate as admin using the _superusers collection (new API)
    // The old pb.admins.* methods are deprecated
    await pb.collection('_superusers').authWithPassword('admin@test.local', 'TestAdmin123!');

    await use(pb);
    pb.authStore.clear();
  },

  /**
   * Create a test user and provide it to the test
   */
  testUser: async ({ pocketbase }, use) => {
    const userData = testUsers.user1;

    // Create user via PocketBase API (as admin)
    const user = await pocketbase.collection('users').create({
      email: userData.email,
      password: userData.password,
      passwordConfirm: userData.passwordConfirm,
      name: userData.name,
    });

    await use({
      id: user.id,
      email: userData.email,
      password: userData.password,
      name: userData.name,
    });

    // Cleanup: delete test user
    try {
      // Re-authenticate as admin if needed for deletion
      if (!pocketbase.authStore.isValid) {
        await pocketbase.collection('_superusers').authWithPassword('admin@test.local', 'TestAdmin123!');
      }
      await pocketbase.collection('users').delete(user.id);
    } catch (e) {
      // User might already be deleted
    }
  },

  /**
   * Authenticated page with logged-in user
   */
  authenticatedPage: async ({ page, testUser }, use) => {
    // Navigate to login page
    await page.goto('/login');

    // Login via UI
    await page.getByLabel(/email/i).fill(testUser.email);
    await page.getByLabel(/password/i).fill(testUser.password);
    await page.getByRole('button', { name: /login|sign in/i }).click();

    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard', { timeout: 5000 });

    await use(page);
  },
});

export { expect } from '@playwright/test';
