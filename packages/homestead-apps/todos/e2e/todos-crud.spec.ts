/**
 * Todos app E2E tests
 *
 * Uses `adminToken` + `authenticatedAdminPage` so the persistent superuser
 * session survives the whole worker (matches the recipes spec rationale).
 */

import { expect } from '@playwright/test';
import { test } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { TodosPage } from './TodosPage';
import {
  createTodo,
  deleteAllPersonalTodos,
  deleteAllTodos,
  listTodos,
} from './helpers';

test.describe('Todos CRUD', () => {
  let todosPage: TodosPage;

  test.beforeEach(async ({ adminToken, adminCreds, authenticatedAdminPage }) => {
    await deleteAllTodos(adminToken);
    await deleteAllPersonalTodos(adminToken, adminCreds.id);
    todosPage = new TodosPage(authenticatedAdminPage);
    await todosPage.goto();
  });

  test.afterEach(async ({ adminToken, adminCreds }) => {
    await deleteAllTodos(adminToken);
    await deleteAllPersonalTodos(adminToken, adminCreds.id);
  });

  test('adds a new todo via the inline input', async () => {
    await todosPage.addTodo('Buy milk');
    await todosPage.expectInActive('Buy milk');
  });

  test('adds a personal todo by default (shows the personal rail)', async () => {
    await todosPage.addPersonalTodo('Solo task');
    await todosPage.expectInActive('Solo task');
    await todosPage.expectKindMarker('Solo task', 'personal');
  });

  test('adds a family todo via the family button (shows the family rail)', async () => {
    await todosPage.addFamilyTodo('Shared task');
    await todosPage.expectInActive('Shared task');
    await todosPage.expectKindMarker('Shared task', 'family');
  });

  test('marks a todo complete and takes it off the list', async ({ adminToken }) => {
    await createTodo(adminToken, { title: 'Pay rent' });
    await todosPage.goto();

    await todosPage.markComplete('Pay rent');
    // A finished todo leaves the list — there is no Completed section to find
    // it in — so the record itself is the only place to confirm the status.
    await todosPage.expectRowAbsent('Pay rent');
    await expect
      .poll(async () =>
        (await listTodos(adminToken)).find((t) => t.title === 'Pay rent')?.status,
      )
      .toBe('completed');
  });

  test('the undo toast puts a completed todo back', async ({ adminToken }) => {
    await createTodo(adminToken, { title: 'Pay rent' });
    await todosPage.goto();

    await todosPage.markComplete('Pay rent');
    await todosPage.expectRowAbsent('Pay rent');

    await todosPage.undoFromToast();
    await todosPage.expectInActive('Pay rent');
  });

  test('moves a todo to Do Later', async ({ adminToken }) => {
    await createTodo(adminToken, { title: 'Book flights' });
    await todosPage.goto();

    await todosPage.moveToDoLater('Book flights');
    await todosPage.expectInDoLater('Book flights');
  });
});
