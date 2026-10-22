/**
 * aepbase Fixture for E2E Tests
 *
 * Each test gets:
 *  - `adminToken` — bearer token for the bootstrap superuser (captured once
 *    in global-setup and persisted to disk; re-read per worker)
 *  - `testUser` — a freshly-created regular user, auto-deleted on teardown
 *  - `userToken` — bearer token for the test user (used by helpers when
 *    seeding user-scoped data)
 *  - `userId` — the test user's id
 *  - `authenticatedPage` — a logged-in Playwright page
 *
 * Specs talk to aepbase through token+url pairs; see
 * `utils/aepbase-helpers.ts` for the CRUD helpers callers use.
 */

import { test as base, Page } from '@playwright/test';
import { getAepbaseUrl, readAdminCreds } from '../config/aepbase.setup';
import { testUsers } from './test-data';
import { trackNetwork } from '../utils/network';

/**
 * The seeded role-bearing group every fixture user joins. Boot seeds
 * `admins`/`members`/`guests` with stable ids (see `permissions/seed.ts`), and
 * `members` confers the role that matches what a real household member gets.
 */
const MEMBER_GROUP_ID = 'members';

type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
};

type AepbaseFixtures = {
  adminToken: string;
  adminCreds: { email: string; password: string; id: string };
  testUser: TestUser;
  userToken: string;
  userId: string;
  authenticatedPage: Page;
  authenticatedAdminPage: Page;
};

export const test = base.extend<AepbaseFixtures>({
  // Track requests from the start so `waitForNetworkIdle` sees everything
  // (see utils/network.ts for why the built-in `networkidle` can't be used).
  page: async ({ page }, use) => {
    trackNetwork(page);
    await use(page);
  },

  adminToken: async ({}, use) => {
    const creds = await readAdminCreds();
    await use(creds.token);
  },

  adminCreds: async ({}, use) => {
    const creds = await readAdminCreds();
    await use({ email: creds.email, password: creds.password, id: creds.id });
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

    // A household is closed by default — a user with no role can't read or write
    // anything, which would fail practically every spec. Joining the seeded
    // Members group confers the `member` role (`all`-scope write), the same
    // access the create-user UI hands a new person by default.
    const joinRes = await fetch(
      `${getAepbaseUrl()}/groups/${MEMBER_GROUP_ID}/group-memberships`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: created.id }),
      },
    );
    if (!joinRes.ok) {
      throw new Error(
        `testUser: could not join the Members group: ${joinRes.status} ${await joinRes.text()}`,
      );
    }

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
    // Generous timeout: the dev server transforms modules on demand, and a
    // loaded machine can stretch a cold navigation well past human-scale
    // latency (global-setup pre-warms the cache, but per-route lazy chunks
    // still compile on first hit within a worker).
    await page.waitForURL('/dashboard', { timeout: 45000 });

    await use(page);
  },

  /**
   * A Playwright page logged in as the bootstrap superuser. Use this for
   * specs that need to exercise superuser-only UI (e.g. the Users app).
   */
  authenticatedAdminPage: async ({ page, adminCreds }, use) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(adminCreds.email);
    await page.getByLabel(/password/i).fill(adminCreds.password);
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await page.waitForURL('/dashboard', { timeout: 45000 });
    await use(page);
  },
});

export { expect } from '@playwright/test';
