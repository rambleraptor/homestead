/**
 * Projects within the todos app, on the VM tier — covers create/select/delete
 * project, pin/unpin to main, and the implicit status sync (single record
 * visible from two scopes).
 *
 * A port of ../e2e/projects-crud.spec.ts (which runs as the bootstrap
 * superuser). Each test boots from a fresh copy of the template database, so
 * there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { TodosPage } from '../e2e/TodosPage';
import { createProject, createTodo, listPersonalTodos, listTodos } from '../e2e/helpers';

describe('Todos projects', () => {
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

  test('creates a project via the switcher and adds a todo into it', async () => {
    await todosPage.createProject('Garden');
    await todosPage.addFamilyTodo('Plant tomatoes');
    await todosPage.expectInActive('Plant tomatoes');

    await todosPage.selectMainProject();
    await todosPage.expectRowAbsent('Plant tomatoes');
  });

  test('adds a private todo inside a project list', async () => {
    await todosPage.createProject('Garden');
    await todosPage.addPersonalTodo('Order seeds');

    // It lives in the list, marked private, and stays out of the main view.
    await todosPage.expectInActive('Order seeds');
    await todosPage.expectKindMarker('Order seeds', 'personal');
    await todosPage.selectMainProject();
    await todosPage.expectRowAbsent('Order seeds');

    // Stored as a personal-todo (private to its author), filed under the list.
    const personal = await listPersonalTodos(adminToken, h.admin.id);
    const seeds = personal.find((t) => t.title === 'Order seeds');
    expect(seeds?.project).toBeTruthy();
    // …and not as a shared todo everyone can read.
    const shared = await listTodos(adminToken);
    expect(shared.map((t) => t.title)).not.toContain('Order seeds');
  });

  test('a private todo pinned to main shows there, and unpins again', async () => {
    await todosPage.createProject('Garden');
    await todosPage.addPersonalTodo('Order seeds');

    await todosPage.pinToMain('Order seeds');
    await todosPage.selectMainProject();
    await todosPage.expectInActive('Order seeds');

    await todosPage.unpinFromMain('Order seeds');
    await todosPage.expectRowAbsent('Order seeds');
    await todosPage.selectProject('Garden');
    await todosPage.expectInActive('Order seeds');
  });

  test('deleting a list moves the deleter’s own private todos back to main', async () => {
    await todosPage.createProject('Garden');
    await todosPage.addPersonalTodo('Order seeds');

    await todosPage.deleteCurrentProject();
    await todosPage.expectInActive('Order seeds');
    await todosPage.expectKindMarker('Order seeds', 'personal');
  });

  test('pinning a project todo makes it visible on main with synced status', async () => {
    const project = await createProject(adminToken, { name: 'Garden' });
    await createTodo(adminToken, {
      title: 'Plant tomatoes',
      project_id: project.id,
    });
    await todosPage.goto();

    await todosPage.selectProject('Garden');
    await todosPage.expectInActive('Plant tomatoes');
    await todosPage.pinToMain('Plant tomatoes');

    // Same record visible on main
    await todosPage.selectMainProject();
    await todosPage.expectInActive('Plant tomatoes');

    // Status update from main flows back to the project view (single record):
    // completing it on main takes it off the project list too.
    await todosPage.markComplete('Plant tomatoes');
    await todosPage.expectRowAbsent('Plant tomatoes');

    await todosPage.selectProject('Garden');
    await todosPage.expectRowAbsent('Plant tomatoes');
  });

  test('unpinning removes the todo from main but keeps it in the project', async () => {
    const project = await createProject(adminToken, { name: 'Garden' });
    await createTodo(adminToken, {
      title: 'Plant tomatoes',
      project_id: project.id,
      in_main: true,
    });
    await todosPage.goto();

    await todosPage.expectInActive('Plant tomatoes'); // main
    await todosPage.unpinFromMain('Plant tomatoes');
    await todosPage.expectRowAbsent('Plant tomatoes');

    await todosPage.selectProject('Garden');
    await todosPage.expectInActive('Plant tomatoes');
  });

  test('deleting a project moves its todos back to main', async () => {
    const project = await createProject(adminToken, { name: 'Garden' });
    await createTodo(adminToken, {
      title: 'Plant tomatoes',
      project_id: project.id,
    });
    await todosPage.goto();

    await todosPage.selectProject('Garden');
    await todosPage.deleteCurrentProject();

    // Switcher should now show only Main, and the todo lives on main.
    await todosPage.expectListAbsent(project.id);
    await todosPage.expectInActive('Plant tomatoes');
  });

  test('deleting a project with the delete-todos option removes its todos', async () => {
    const project = await createProject(adminToken, { name: 'Garden' });
    await createTodo(adminToken, {
      title: 'Plant tomatoes',
      project_id: project.id,
    });
    await todosPage.goto();

    await todosPage.selectProject('Garden');
    await todosPage.deleteCurrentProject({ deleteTodos: true });

    // The list is gone and its todo did not fall back to main.
    await todosPage.expectListAbsent(project.id);
    await todosPage.expectRowAbsent('Plant tomatoes');
  });
});
