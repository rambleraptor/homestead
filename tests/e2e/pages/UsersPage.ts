/**
 * Users Page Object Model
 */

import { Page, expect } from '@playwright/test';

export class UsersPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/users');
  }

  async expectToBeOnUsersPage() {
    await expect(this.page).toHaveURL(/\/users$/);
    await expect(this.page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();
  }

  async clickAddUser() {
    const btn = this.page.getByTestId('add-user-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async fillUserForm(data: {
    email: string;
    displayName?: string;
    type?: 'regular' | 'superuser';
    password?: string;
  }) {
    await this.page.getByTestId('user-email-input').fill(data.email);
    if (data.displayName !== undefined) {
      await this.page.getByTestId('user-display-name-input').fill(data.displayName);
    }
    if (data.type) {
      await this.page.getByTestId('user-type-select').selectOption(data.type);
    }
    if (data.password !== undefined) {
      await this.page.getByTestId('user-password-input').fill(data.password);
    }
  }

  async submitForm(label: 'Create User' | 'Save' = 'Create User') {
    const submit = this.page.getByRole('button', { name: label });
    await submit.click();
  }

  async createUser(data: {
    email: string;
    displayName?: string;
    type?: 'regular' | 'superuser';
    password: string;
  }) {
    await this.clickAddUser();
    await this.fillUserForm(data);
    await this.submitForm('Create User');
    // Wait for modal to close
    await expect(this.page.getByTestId('user-email-input')).not.toBeVisible();
  }

  async expectUserInList(email: string) {
    await expect(this.page.getByText(email).first()).toBeVisible();
  }

  async expectUserNotInList(email: string) {
    await expect(this.page.getByText(email)).toHaveCount(0);
  }

  async clickEditUser(userId: string) {
    await this.page.getByTestId(`edit-user-${userId}`).click();
  }

  async clickDeleteUser(userId: string) {
    await this.page.getByTestId(`delete-user-${userId}`).click();
  }

  async confirmDelete() {
    const confirm = this.page.getByRole('button', { name: /^delete$/i }).last();
    await confirm.click();
  }

  async expectSuperuserBadge(email: string) {
    const row = this.page.locator('div', { hasText: email }).first();
    await expect(row.getByText('superuser')).toBeVisible();
  }
}
