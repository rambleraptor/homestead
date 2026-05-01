/**
 * Todos module E2E tests
 *
 * Uses `adminToken` + `authenticatedAdminPage` so the persistent superuser
 * session survives the whole worker (matches the recipes spec rationale).
 */

import { test } from '../../fixtures/aepbase.fixture';
import { TodosPage } from '../../pages/TodosPage';
import { createTodo, deleteAllTodos } from '../../utils/aepbase-helpers';

test.describe('Todos CRUD', () => {
  let todosPage: TodosPage;

  test.beforeEach(async ({ adminToken, authenticatedAdminPage }) => {
    await deleteAllTodos(adminToken);
    todosPage = new TodosPage(authenticatedAdminPage);
    await todosPage.goto();
  });

  test.afterEach(async ({ adminToken }) => {
    await deleteAllTodos(adminToken);
  });

  test('adds a new todo via the inline input', async () => {
    await todosPage.addTodo('Buy milk');
    await todosPage.expectInActive('Buy milk');
    await todosPage.expectGreenSegmentZero();
  });

  test('marks a todo complete and shows it under Completed', async ({ adminToken }) => {
    await createTodo(adminToken, { title: 'Pay rent' });
    await todosPage.goto();

    await todosPage.markComplete('Pay rent');
    await todosPage.expectInCompleted('Pay rent');
    await todosPage.expectGreenSegmentNonZero();
  });

  test('moves a todo to Do Later', async ({ adminToken }) => {
    await createTodo(adminToken, { title: 'Book flights' });
    await todosPage.goto();

    await todosPage.moveToDoLater('Book flights');
    await todosPage.expectInDoLater('Book flights');
  });

  test('reset progress returns every todo to pending', async ({ adminToken }) => {
    await createTodo(adminToken, { title: 'Task A', status: 'completed' });
    await createTodo(adminToken, { title: 'Task B', status: 'in_progress' });
    await createTodo(adminToken, { title: 'Task C', status: 'do_later' });
    await todosPage.goto();

    await todosPage.resetProgress();

    await todosPage.expectInActive('Task A');
    await todosPage.expectInActive('Task B');
    await todosPage.expectInActive('Task C');
    await todosPage.expectGreenSegmentZero();
  });
});
