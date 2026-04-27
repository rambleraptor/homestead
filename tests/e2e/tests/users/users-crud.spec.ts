/**
 * Superuser → Users sub-page E2E tests.
 *
 * Only superusers may access /superuser/users. These specs exercise the
 * CRUD flow as the bootstrap admin and verify the regular-user gate
 * (nav hidden, direct navigation redirects to /dashboard).
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { UsersPage } from '../../pages/UsersPage';
import {
  aepList,
  createUser,
  deleteUsersExcept,
} from '../../utils/aepbase-helpers';

const uniqueEmail = (tag: string) =>
  `users-e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

test.describe('Superuser → Users sub-page (superuser)', () => {
  let usersPage: UsersPage;

  test.beforeEach(async ({ authenticatedAdminPage, adminCreds, adminToken, testUser }) => {
    usersPage = new UsersPage(authenticatedAdminPage);
    // Clear every user except the bootstrap admin and the fixture test user.
    await deleteUsersExcept(adminToken, [adminCreds.id, testUser.id]);
    await usersPage.goto();
    await usersPage.expectToBeOnUsersPage();
  });

  test.afterEach(async ({ adminToken, adminCreds, testUser }) => {
    await deleteUsersExcept(adminToken, [adminCreds.id, testUser.id]);
  });

  test('superuser can create a regular user via the UI', async ({ adminToken }) => {
    const email = uniqueEmail('create');

    await usersPage.createUser({
      email,
      displayName: 'Created User',
      type: 'regular',
      password: 'password123',
    });

    await usersPage.expectUserInList(email);

    // Verify backend state.
    const users = await aepList<{ email: string; type?: string }>(adminToken, 'users');
    const created = users.find((u) => u.email === email);
    expect(created).toBeTruthy();
    expect(created?.type).toBe('regular');
  });

  test('superuser can create another superuser', async ({ adminToken }) => {
    const email = uniqueEmail('super');

    await usersPage.createUser({
      email,
      displayName: 'Second Admin',
      type: 'superuser',
      password: 'password123',
    });

    await usersPage.expectUserInList(email);

    const users = await aepList<{ email: string; type?: string }>(adminToken, 'users');
    expect(users.find((u) => u.email === email)?.type).toBe('superuser');
  });

  test('superuser can edit a user (display name + type)', async ({ adminToken }) => {
    const email = uniqueEmail('edit');
    const created = await createUser(adminToken, {
      email,
      password: 'password123',
      display_name: 'Old Name',
      type: 'regular',
    });

    await usersPage.goto();
    await usersPage.clickEditUser(created.id);

    await usersPage.fillUserForm({
      email,
      displayName: 'New Name',
      type: 'superuser',
    });
    await usersPage.submitForm('Save');

    // Modal should close.
    await expect(usersPage['page'].getByTestId('user-email-input')).not.toBeVisible();

    const users = await aepList<{ id: string; display_name?: string; type?: string }>(
      adminToken,
      'users',
    );
    const updated = users.find((u) => u.id === created.id);
    expect(updated?.display_name).toBe('New Name');
    expect(updated?.type).toBe('superuser');
  });

  test('superuser can delete a user', async ({ adminToken }) => {
    const email = uniqueEmail('del');
    const created = await createUser(adminToken, {
      email,
      password: 'password123',
      type: 'regular',
    });

    await usersPage.goto();
    await usersPage.expectUserInList(email);

    await usersPage.clickDeleteUser(created.id);
    await usersPage.confirmDelete();

    // Row disappears.
    await expect(usersPage['page'].getByText(email)).toHaveCount(0);

    const users = await aepList<{ id: string }>(adminToken, 'users');
    expect(users.find((u) => u.id === created.id)).toBeUndefined();
  });

  test("superuser cannot delete their own account (button disabled)", async ({
    authenticatedAdminPage,
    adminCreds,
  }) => {
    const selfDelete = authenticatedAdminPage.getByTestId(`delete-user-${adminCreds.id}`);
    await expect(selfDelete).toBeDisabled();
  });
});

test.describe('Superuser → Users sub-page (regular user gate)', () => {
  test('nav does not expose the Superuser link for regular users', async ({
    authenticatedPage,
  }) => {
    // Sidebar filters out superuser-only modules.
    const link = authenticatedPage.getByRole('link', { name: 'Superuser' });
    await expect(link).toHaveCount(0);
  });

  test('direct navigation to /superuser/users redirects regular users to /dashboard', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/superuser/users');
    await authenticatedPage.waitForURL('/dashboard', { timeout: 5000 });
    await expect(authenticatedPage).toHaveURL(/\/dashboard$/);
  });
});
