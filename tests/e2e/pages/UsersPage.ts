/**
 * Users Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class UsersPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/superuser/users');
  }

  async expectToBeOnUsersPage() {
    await this.driver.expectURL(/\/superuser\/users$/);
    await this.expect(this.driver.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();
  }

  async clickAddUser() {
    const btn = this.driver.getByTestId('add-user-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async fillUserForm(data: {
    email: string;
    displayName?: string;
    type?: 'regular' | 'superuser';
    password?: string;
  }) {
    await this.driver.getByTestId('user-email-input').fill(data.email);
    if (data.displayName !== undefined) {
      await this.driver.getByTestId('user-display-name-input').fill(data.displayName);
    }
    if (data.type) {
      await this.driver.getByTestId('user-type-select').selectOption(data.type);
    }
    if (data.password !== undefined) {
      await this.driver.getByTestId('user-password-input').fill(data.password);
    }
  }

  async submitForm(label: 'Create User' | 'Save' = 'Create User') {
    const submit = this.driver.getByRole('button', { name: label });
    await submit.click();
  }

  async createUser(data: {
    email: string;
    displayName?: string;
    type?: 'regular' | 'superuser';
    tags?: string[];
    password: string;
  }) {
    await this.clickAddUser();
    await this.fillUserForm(data);
    await this.submitForm('Create User');
    // Wait for modal to close
    await this.expect(this.driver.getByTestId('user-email-input')).toBeHidden();
  }

  async expectUserInList(email: string) {
    await this.expect(this.driver.getByText(email).first()).toBeVisible();
  }

  async expectUserNotInList(email: string) {
    await this.expect(this.driver.getByText(email)).toHaveCount(0);
  }

  async clickEditUser(userId: string) {
    await this.driver.getByTestId(`edit-user-${userId}`).click();
  }

  async clickDeleteUser(userId: string) {
    await this.driver.getByTestId(`delete-user-${userId}`).click();
  }

  async confirmDelete() {
    const confirm = this.driver.getByRole('button', { name: /^delete$/i }).last();
    await confirm.click();
  }

  async expectSuperuserBadge(email: string) {
    const row = this.driver.locator('div').filter({ hasText: email }).first();
    await this.expect(row.getByText('superuser')).toBeVisible();
  }

  async expectUserTag(userId: string, tag: string) {
    await this.expect(this.driver.getByTestId(`user-tag-${userId}-${tag}`)).toBeVisible();
  }
}
