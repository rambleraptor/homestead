/**
 * Playwright Configuration for HomeOS E2E Tests.
 *
 * The dev server is started with AEPBASE_URL pointing at the test
 * aepbase instance spun up in global-setup (on port 8092 so it doesn't
 * clash with the developer's :8090).
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
    baseURL: 'http://localhost:3000',
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

  webServer: [
    {
      command: 'npm run dev',
      cwd: '../../frontend',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        // Point the /api/aep proxy at the test aepbase instance.
        AEPBASE_URL: 'http://127.0.0.1:8092',
        __NEXT_DISABLE_OVERLAY: '1',
      },
    },
  ],

  globalSetup: './config/global-setup.ts',
  globalTeardown: './config/global-teardown.ts',
});
