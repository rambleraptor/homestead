/**
 * Playwright Configuration for Homestead E2E Tests.
 *
 * The full stack (aepbase + terraform-applied schema + frontend) is
 * brought up by `make test-e2e` via docker-compose before this config
 * is loaded. We point Playwright at the published localhost ports and
 * read admin credentials from env vars exported by the make target.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Serial because the tests share one aepbase instance + admin user.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
