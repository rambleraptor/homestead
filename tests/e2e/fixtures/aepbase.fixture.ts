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
import { getAepbaseUrl } from '../utils/aepbase-helpers';
import { testUsers } from './test-data';

interface AdminCreds {
  email: string;
  password: string;
  id: string;
  token: string;
}

/**
 * Resolve admin credentials for the running compose stack. The
 * `make test-e2e` target exports AEPBASE_ADMIN_EMAIL +
 * AEPBASE_ADMIN_PASSWORD from the bootstrap container's
 * /secrets/admin.env before invoking Playwright; this helper logs in
 * to mint a fresh token per worker.
 */
async function readAdminCreds(): Promise<AdminCreds> {
  const email = process.env.AEPBASE_ADMIN_EMAIL;
  const password = process.env.AEPBASE_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'AEPBASE_ADMIN_EMAIL / AEPBASE_ADMIN_PASSWORD not set. ' +
        'Run `make test-e2e` (which boots the docker-compose stack) ' +
        'instead of invoking playwright directly.',
    );
  }
  const res = await fetch(`${getAepbaseUrl()}/users/:login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(
      `admin login failed: ${res.status} ${await res.text()}`,
    );
  }
  const parsed = (await res.json()) as { token: string; user: { id: string } };
  return { email, password, id: parsed.user.id, token: parsed.token };
}

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
    // Generous timeout: Next.js dev mode can take several seconds to compile
    // /dashboard on first hit within a worker, and CI runs the dev server
    // shared across two workers.
    await page.waitForURL('/dashboard', { timeout: 20000 });

    await use(page);
  },

  /**
   * A Playwright page logged in as the bootstrap superuser. Use this for
   * specs that need to exercise superuser-only UI (e.g. the Users module).
   */
  authenticatedAdminPage: async ({ page, adminCreds }, use) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(adminCreds.email);
    await page.getByLabel(/password/i).fill(adminCreds.password);
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await page.waitForURL('/dashboard', { timeout: 20000 });
    await use(page);
  },
});

export { expect } from '@playwright/test';
