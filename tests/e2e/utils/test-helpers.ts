/**
 * General Test Helper Functions
 */

import { Page, expect } from '@playwright/test';
import { waitForNetworkIdle } from './network';

/**
 * Wait for toast notification to appear and optionally check its message
 */
export async function waitForToast(page: Page, expectedMessage?: string | RegExp) {
  const toast = page.locator('[role="status"], [role="alert"], .toast').first();
  await expect(toast).toBeVisible({ timeout: 5000 });

  if (expectedMessage) {
    await expect(toast).toContainText(expectedMessage);
  }

  return toast;
}

/**
 * Wait for a specific URL with retry
 */
export async function waitForUrl(page: Page, url: string | RegExp, timeout = 5000) {
  await page.waitForURL(url, { timeout });
}

/**
 * Fill a form field by label
 */
export async function fillFieldByLabel(page: Page, label: string | RegExp, value: string) {
  await page.getByLabel(label).fill(value);
}

/**
 * Click a button by name
 */
export async function clickButton(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name }).click();
}

/**
 * Navigate using the main navigation
 */
export async function navigateTo(page: Page, linkName: string | RegExp) {
  await page.getByRole('navigation').getByRole('link', { name: linkName }).click();
}

/**
 * Check if element is visible
 */
export async function isVisible(page: Page, selector: string): Promise<boolean> {
  try {
    await expect(page.locator(selector)).toBeVisible({ timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reload page and wait for it to be ready
 */
export async function reloadAndWait(page: Page) {
  await page.reload();
  await waitForNetworkIdle(page);
}
