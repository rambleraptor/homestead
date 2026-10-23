/**
 * Users page, on the VM tier.
 *
 * A port of tests/e2e/tests/users/users-crud.spec.ts: same page object and
 * seed helpers, but the SPA runs in happy-dom against the server's in-process
 * fetch handler. Each test boots from a fresh copy of the template database
 * (bootstrap admin + one member), so there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  bootHomestead,
  type Harness,
  type Session,
} from '@rambleraptor/homestead-test-harness/vm/boot';
import { UsersPage } from '../e2e/pages/UsersPage';
import { createUser, listOrEmpty } from '../e2e/utils/aepbase-helpers';

const uniqueEmail = (tag: string) =>
  `users-vm-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

describe('Users page (superuser)', () => {
  let h: Harness;
  let usersPage: UsersPage;
  let admin: Session;

  beforeEach(async () => {
    h = await bootHomestead();
    admin = await h.loginAs(h.admin);
    usersPage = new UsersPage(h.driver);
    await usersPage.goto();
    await usersPage.expectToBeOnUsersPage();
  });

  afterEach(async () => {
    await h.close();
  });

  test('superuser can create a regular user via the UI', async () => {
    const email = uniqueEmail('create');
    await usersPage.createUser({ email, displayName: 'Created User', type: 'regular', password: 'password123' });
    await usersPage.expectUserInList(email);

    const users = await listOrEmpty<{ email: string; type?: string }>(admin.token, 'users');
    const created = users.find((u) => u.email === email);
    expect(created).toBeTruthy();
    expect(created?.type).toBe('regular');
  });

  test('superuser can create another superuser', async () => {
    const email = uniqueEmail('super');
    await usersPage.createUser({ email, displayName: 'Second Admin', type: 'superuser', password: 'password123' });
    await usersPage.expectUserInList(email);

    const users = await listOrEmpty<{ email: string; type?: string }>(admin.token, 'users');
    expect(users.find((u) => u.email === email)?.type).toBe('superuser');
  });

  test('superuser can edit a user (display name + type)', async () => {
    const email = uniqueEmail('edit');
    const created = await createUser(admin.token, {
      email,
      password: 'password123',
      display_name: 'Old Name',
      type: 'regular',
    });

    await usersPage.goto();
    await usersPage.clickEditUser(created.id);
    await usersPage.fillUserForm({ email, displayName: 'New Name', type: 'superuser' });
    await usersPage.submitForm('Save');
    await h.driver.expect(h.driver.getByTestId('user-email-input')).toBeHidden();

    const users = await listOrEmpty<{ id: string; display_name?: string; type?: string }>(admin.token, 'users');
    const updated = users.find((u) => u.id === created.id);
    expect(updated?.display_name).toBe('New Name');
    expect(updated?.type).toBe('superuser');
  });

  test('superuser can delete a user', async () => {
    const email = uniqueEmail('del');
    const created = await createUser(admin.token, { email, password: 'password123', type: 'regular' });

    await usersPage.goto();
    await usersPage.expectUserInList(email);
    await usersPage.clickDeleteUser(created.id);
    await usersPage.confirmDelete();
    await h.driver.expect(h.driver.getByText(email)).toHaveCount(0);

    const users = await listOrEmpty<{ id: string }>(admin.token, 'users');
    expect(users.find((u) => u.id === created.id)).toBeUndefined();
  });

  test('superuser cannot delete their own account (button disabled)', async () => {
    await h.driver.expect(h.driver.getByTestId(`delete-user-${admin.id}`)).toBeDisabled();
  });
});

describe('Users page (regular user gate)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
  });

  afterEach(async () => {
    await h.close();
  });

  test('nav does not expose the Users link for regular users', async () => {
    await h.driver.expect(h.driver.getByRole('link', { name: 'Users' })).toHaveCount(0);
  });

  test('direct navigation to /superuser/users redirects regular users to /dashboard', async () => {
    await h.driver.goto('/superuser/users');
    await h.driver.expectURL(/\/dashboard$/);
  });
});
