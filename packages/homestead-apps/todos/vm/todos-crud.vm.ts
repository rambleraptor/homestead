/**
 * Todos CRUD, on the VM tier.
 *
 * A port of ../e2e/todos-crud.spec.ts (which runs as the bootstrap superuser):
 * same page object and seed helpers, but the SPA runs in happy-dom against the
 * server's in-process fetch handler. Each test boots from a fresh copy of the
 * template database, so there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { TodosPage } from '../e2e/TodosPage';
import { createTodo, listTodos } from '../e2e/helpers';

describe('Todos CRUD', () => {
  let h: Harness;
  let todosPage: TodosPage;
  let adminToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: adminToken } = await h.loginAs(h.admin));
    todosPage = new TodosPage(h.driver);
    await todosPage.goto();
  });

  afterEach(async () => {
    await h.close();
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

  test('marks a todo complete and takes it off the list', async () => {
    await createTodo(adminToken, { title: 'Pay rent' });
    await todosPage.goto();

    await todosPage.markComplete('Pay rent');
    await todosPage.expectRowAbsent('Pay rent');
    await expect
      .poll(async () => (await listTodos(adminToken)).find((t) => t.title === 'Pay rent')?.status)
      .toBe('completed');
  });

  test('the undo toast puts a completed todo back', async () => {
    await createTodo(adminToken, { title: 'Pay rent' });
    await todosPage.goto();

    await todosPage.markComplete('Pay rent');
    await todosPage.expectRowAbsent('Pay rent');

    await todosPage.undoFromToast();
    await todosPage.expectInActive('Pay rent');
  });

  test('moves a todo to Do Later', async () => {
    await createTodo(adminToken, { title: 'Book flights' });
    await todosPage.goto();

    await todosPage.moveToDoLater('Book flights');
    await todosPage.expectInDoLater('Book flights');
  });
});
