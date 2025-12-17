/**
 * Settings Page Object Model
 */

import { Page, expect } from '@playwright/test';

export class SettingsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/settings');
  }

  async expectToBeOnSettingsPage() {
    await expect(this.page).toHaveURL(/\/settings/);
  }

  async changePassword(currentPassword: string, newPassword: string, confirmPassword?: string) {
    await this.page.getByLabel(/current password|old password/i).fill(currentPassword);
    await this.page.getByLabel(/^new password/i).fill(newPassword);
    await this.page.getByLabel(/confirm password|confirm new password/i).fill(confirmPassword || newPassword);
    await this.page.getByRole('button', { name: /change password|update password/i }).click();
  }

  async expectPasswordChangeSuccess() {
    // Sonner toast with success message
    // Toasts typically appear with data attributes like [data-sonner-toast]
    // and contain the success text "Password changed successfully"
    const successToast = this.page.getByText(/password.*changed.*successfully/i);
    await expect(successToast).toBeVisible({ timeout: 5000 });
  }

  async expectPasswordChangeError(message?: string | RegExp) {
    // Error can appear either as inline error or as toast
    // Inline error: <div className="p-3 text-sm bg-red-50/20 text-red-600 rounded-md">
    // Toast error: Sonner toast with error type

    if (message) {
      // Look for text matching the error message pattern
      const errorText = this.page.getByText(message).first();
      await expect(errorText).toBeVisible({ timeout: 5000 });
    } else {
      // Look for any error indicator
      const errorElement = this.page.locator('.text-red-600, [data-type="error"]').first();
      await expect(errorElement).toBeVisible({ timeout: 5000 });
    }
  }
}
