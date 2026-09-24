/**
 * Devices Page Object Model — `/devices`.
 */

import { Page, expect, Locator } from '@playwright/test';

export class DevicesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/devices');
  }

  deviceRow(name: string): Locator {
    return this.page.getByTestId('device-row').filter({ hasText: name }).first();
  }

  async setThreshold(name: string, percent: number) {
    await this.deviceRow(name).getByTestId('device-threshold').selectOption(String(percent));
  }

  async forgetDevice(name: string) {
    await this.deviceRow(name).getByTestId('device-delete').click();
    const confirmButton = this.page.getByRole('button', { name: /^forget$/i }).last();
    await confirmButton.waitFor({ state: 'visible' });
    await confirmButton.click();
  }

  async expectEmptyState() {
    await expect(this.page.getByTestId('devices-empty')).toBeVisible();
  }

  async expectDeviceInList(name: string) {
    await expect(this.deviceRow(name)).toBeVisible();
  }

  async expectDeviceNotInList(name: string) {
    await expect(this.page.getByTestId('device-row').filter({ hasText: name })).toHaveCount(0);
  }

  async expectBattery(name: string, text: string | RegExp) {
    await expect(this.deviceRow(name).getByTestId('device-battery')).toHaveText(text);
  }
}
