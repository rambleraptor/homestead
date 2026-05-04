/**
 * Projects within the todos module — covers create/select/delete project,
 * pin/unpin to main, and the implicit status sync (single record visible
 * from two scopes).
 */

import { test } from '../../fixtures/aepbase.fixture';
import { TodosPage } from '../../pages/TodosPage';
import {
  createProject,
  createTodo,
  deleteAllProjects,
  deleteAllTodos,
} from '../../utils/aepbase-helpers';

test.describe('Todos projects', () => {
  let todosPage: TodosPage;

  test.beforeEach(async ({ adminToken, authenticatedAdminPage }) => {
    await deleteAllTodos(adminToken);
    await deleteAllProjects(adminToken);
    todosPage = new TodosPage(authenticatedAdminPage);
    await todosPage.goto();
  });

  test.afterEach(async ({ adminToken }) => {
    await deleteAllTodos(adminToken);
    await deleteAllProjects(adminToken);
  });

  test('creates a project via the switcher and adds a todo into it', async () => {
    await todosPage.createProject('Garden');
    await todosPage.addTodo('Plant tomatoes');
    await todosPage.expectInActive('Plant tomatoes');

    await todosPage.selectMainProject();
    await todosPage.expectRowAbsent('Plant tomatoes');
  });

  test('pinning a project todo makes it visible on main with synced status', async ({
    adminToken,
  }) => {
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

    // Status update from main flows back to the project view (single record)
    await todosPage.markComplete('Plant tomatoes');
    await todosPage.expectInCompleted('Plant tomatoes');

    await todosPage.selectProject('Garden');
    await todosPage.expectInCompleted('Plant tomatoes');
  });

  test('unpinning removes the todo from main but keeps it in the project', async ({
    adminToken,
  }) => {
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

  test('deleting a project moves its todos back to main', async ({
    adminToken,
  }) => {
    const project = await createProject(adminToken, { name: 'Garden' });
    await createTodo(adminToken, {
      title: 'Plant tomatoes',
      project_id: project.id,
    });
    await todosPage.goto();

    await todosPage.selectProject('Garden');
    await todosPage.deleteCurrentProject();

    // Switcher should now show only Main, and the todo lives on main.
    await todosPage.expectProjectPillAbsent(project.id);
    await todosPage.expectInActive('Plant tomatoes');
  });
});
