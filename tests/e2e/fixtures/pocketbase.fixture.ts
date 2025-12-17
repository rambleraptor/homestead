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
  userPocketbase: PocketBase;
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
   * Each test gets a unique user to avoid conflicts
   */
  testUser: async ({ pocketbase }, use) => {
    const userData = testUsers.user1;

    // Generate unique email for this test to avoid conflicts
    const uniqueEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;

    // Create user via PocketBase API (as admin)
    const user = await pocketbase.collection('users').create({
      email: uniqueEmail,
      password: userData.password,
      passwordConfirm: userData.passwordConfirm,
      name: userData.name,
    });

    await use({
      id: user.id,
      email: uniqueEmail,
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
      // User might already be deleted, log but don't fail
      console.warn(`Failed to cleanup test user ${user.id}:`, e);
    }
  },

  /**
   * PocketBase client authenticated as the test user
   * Use this for operations on user collections (events, gift_cards, etc.)
   */
  userPocketbase: async ({ testUser }, use) => {
    const pb = new PocketBase(getPocketBaseUrl());

    // Authenticate as the test user
    console.log(`[userPocketbase] Authenticating as user: ${testUser.email}`);
    try {
      const authData = await pb.collection('users').authWithPassword(testUser.email, testUser.password);
      console.log(`[userPocketbase] Authentication successful!`, {
        userId: authData.record.id,
        email: authData.record.email,
        isValid: pb.authStore.isValid,
      });
    } catch (error) {
      console.error(`[userPocketbase] Authentication FAILED:`, error);
      throw error;
    }

    await use(pb);
    pb.authStore.clear();
  },

  /**
   * Authenticated page with logged-in user
   */
  authenticatedPage: async ({ page, testUser }, use) => {
    // Listen to browser console messages
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      // Forward browser console to test console with prefix
      if (type === 'error') {
        console.error(`[Browser Console Error] ${text}`);
      } else if (type === 'warning') {
        console.warn(`[Browser Console Warning] ${text}`);
      } else if (text.includes('[')) {
        // Only log our debug messages (those with [brackets])
        console.log(`[Browser] ${text}`);
      }
    });

    // Listen to page errors
    page.on('pageerror', error => {
      console.error(`[Browser Page Error] ${error.message}`);
      console.error(error.stack);
    });

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
