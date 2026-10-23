/**
 * Todo categories E2E — per-list managed categories on project lists and
 * templates. Uses the admin session (categories live on the household `todo` /
 * `project` resources, so superuser access is fine here).
 */

import { test } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { TodosPage } from './TodosPage';
import { playwrightDriver } from '../../../homestead-test-harness/driver/pw-driver';
import { TemplatesPage } from './TemplatesPage';
import {
  addTemplateCategory,
  addTemplateItem,
  createCategory,
  createListTemplate,
  createProject,
  deleteAllListTemplates,
  deleteAllProjects,
  deleteAllTodos,
} from './helpers';

test.describe('Todo categories', () => {
  test.beforeEach(async ({ adminToken }) => {
    // Todos first — a project can't be deleted while todos still reference it.
    await deleteAllTodos(adminToken);
    await deleteAllProjects(adminToken);
    await deleteAllListTemplates(adminToken);
  });

  test.afterEach(async ({ adminToken }) => {
    await deleteAllTodos(adminToken);
    await deleteAllProjects(adminToken);
    await deleteAllListTemplates(adminToken);
  });

  test('groups todos by category and un-categorizes on delete', async ({
    adminToken,
    authenticatedAdminPage,
  }) => {
    const project = await createProject(adminToken, { name: 'Party' });
    await createCategory(adminToken, project.id, { name: 'Food', position: 0 });
    await createCategory(adminToken, project.id, { name: 'Fun', position: 1 });

    const todos = new TodosPage(playwrightDriver(authenticatedAdminPage));
    await todos.goto();
    await todos.selectProject('Party');

    // Both categories render as (empty) groups.
    await todos.expectCategoryGroupVisible('Food');
    await todos.expectCategoryGroupVisible('Fun');

    // Adding with "Food" selected lands the todo in that group.
    await todos.selectAddCategory('Food');
    await todos.addTodo('Cake');
    await todos.expectTodoInGroup('Food', 'Cake');

    // Deleting "Food" leaves the todo in place (uncategorized), not deleted.
    await todos.deleteCategory('Food');
    await todos.expectRowVisible('Cake');
  });

  test('instantiating a template carries its categories into the new list', async ({
    adminToken,
    authenticatedAdminPage,
  }) => {
    const template = await createListTemplate(adminToken, { name: 'Camping' });
    const gear = await addTemplateCategory(adminToken, template.id, {
      name: 'Gear',
      position: 0,
    });
    await addTemplateItem(adminToken, template.id, 'Tent', gear.id);
    await addTemplateItem(adminToken, template.id, 'Snacks');

    const templates = new TemplatesPage(authenticatedAdminPage);
    await templates.goto();
    await templates.createListFrom('Camping');

    // Instantiation navigates to the new list; its category + assignment carry.
    const todos = new TodosPage(playwrightDriver(authenticatedAdminPage));
    await todos.expectCategoryGroupVisible('Gear');
    await todos.expectTodoInGroup('Gear', 'Tent');
    await todos.expectRowVisible('Snacks');
  });
});
