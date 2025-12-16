/**
 * Alternative PocketBase Fixture using User Registration
 *
 * Creates users via the registration endpoint instead of requiring admin auth
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
 * Extended test with PocketBase fixtures (using registration)
 */
export const test = base.extend<PocketBaseFixtures>({
  /**
   * PocketBase client instance
   */
  pocketbase: async ({}, use) => {
    const pb = new PocketBase(getPocketBaseUrl());
    await use(pb);
    pb.authStore.clear();
  },

  /**
   * Create a test user via registration endpoint
   */
  testUser: async ({ pocketbase }, use) => {
    const userData = testUsers.user1;

    try {
      // Try to create user via registration (public endpoint)
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

      // Cleanup: Try to delete via auth
      try {
        // Authenticate as the user to delete their own account
        await pocketbase.collection('users').authWithPassword(userData.email, userData.password);
        await pocketbase.collection('users').delete(user.id);
      } catch (e) {
        // User might already be deleted or deletion not allowed
        console.warn('Could not delete test user:', e);
      }
    } catch (error: any) {
      // If registration fails, throw detailed error
      console.error('Failed to create test user via registration:', error);
      console.error('This might mean user registration is disabled in PocketBase.');
      console.error('You may need to enable user registration or configure collection rules.');
      throw error;
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
