/**
 * aepbase Fixture for E2E Tests
 *
 * Each test gets:
 *  - `adminToken` — bearer token for the bootstrap superuser (captured once
 *    in global-setup and persisted to disk; re-read per worker)
 *  - `testUser` — a freshly-created regular user, auto-deleted on teardown
 *  - `userToken` — bearer token for the test user (used by helpers when
 *    seeding user-scoped data)
 *  - `userId` — the test user's id (equivalent to the old PB `userPocketbase`
 *    model id)
 *  - `authenticatedPage` — a logged-in Playwright page
 *
 * The PB-era `userPocketbase` / `pocketbase` client fixtures are replaced
 * by simple token+url pairs; see `utils/aepbase-helpers.ts` for the CRUD
 * helpers the specs call with these tokens.
 */

import { test as base, Page } from '@playwright/test';
import { getAepbaseUrl, readAdminCreds } from '../config/aepbase.setup';
import { testUsers } from './test-data';

type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
};

type AepbaseFixtures = {
  adminToken: string;
  testUser: TestUser;
  userToken: string;
  userId: string;
  authenticatedPage: Page;
};

export const test = base.extend<AepbaseFixtures>({
  adminToken: async ({}, use) => {
    const creds = await readAdminCreds();
    await use(creds.token);
  },

  /**
   * Create a fresh regular user for each test. The admin creates the user
   * via `POST /users`; cleanup deletes it via `DELETE /users/{id}`.
   */
  testUser: async ({ adminToken }, use) => {
    const userData = testUsers.user1;
    const uniqueEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;

    const createRes = await fetch(`${getAepbaseUrl()}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: uniqueEmail,
        display_name: userData.name,
        password: userData.password,
        type: 'regular',
      }),
    });
    if (!createRes.ok) {
      throw new Error(`testUser: create failed: ${createRes.status} ${await createRes.text()}`);
    }
    const created = (await createRes.json()) as { id: string };

    await use({
      id: created.id,
      email: uniqueEmail,
      password: userData.password,
      name: userData.name,
    });

    // Cleanup
    await fetch(`${getAepbaseUrl()}/users/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch((e) => console.warn('Failed to cleanup test user:', e));
  },

  userToken: async ({ testUser }, use) => {
    const res = await fetch(`${getAepbaseUrl()}/users/:login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: testUser.password }),
    });
    if (!res.ok) {
      throw new Error(`userToken: login failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { token: string };
    await use(body.token);
  },

  userId: async ({ testUser }, use) => {
    await use(testUser.id);
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') console.error(`[Browser Console Error] ${text}`);
      else if (type === 'warning') console.warn(`[Browser Console Warning] ${text}`);
      else if (text.includes('[')) console.log(`[Browser] ${text}`);
    });
    page.on('pageerror', (error) => {
      console.error(`[Browser Page Error] ${error.message}`);
      console.error(error.stack);
    });

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(testUser.email);
    await page.getByLabel(/password/i).fill(testUser.password);
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await page.waitForURL('/dashboard', { timeout: 5000 });

    await use(page);
  },
});

export { expect } from '@playwright/test';
