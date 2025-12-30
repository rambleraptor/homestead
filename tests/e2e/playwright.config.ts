/**
 * Playwright Configuration for HomeOS E2E Tests
 *
 * See https://playwright.dev/docs/test-configuration
 */

import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',

  /* Run tests in files in parallel */
  fullyParallel: false, // False because we share one PocketBase instance

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : 1, // Single worker to avoid DB conflicts

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  /* Shared settings for all projects */
  use: {
    /* Base URL for navigation */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',

    /* PocketBase URL for tests */
    ...(process.env.POCKETBASE_URL ? { baseURL: process.env.POCKETBASE_URL } : {}),
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
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
        // Point frontend to test PocketBase instance on port 8092
        NEXT_PUBLIC_POCKETBASE_URL: 'http://127.0.0.1:8092',
        // Disable Next.js dev overlay to prevent it from blocking test interactions
        __NEXT_DISABLE_OVERLAY: '1',
      },
    },
  ],

  /* Global setup and teardown */
  globalSetup: './config/global-setup.ts',
  globalTeardown: './config/global-teardown.ts',
});
