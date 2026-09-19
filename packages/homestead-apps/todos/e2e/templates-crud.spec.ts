/**
 * List templates within the todos app — covers managing a template and its
 * items on the dedicated page, instantiating a template into a new project
 * pre-filled with its items (from both the templates page and the project
 * switcher's "From template" picker), and the temporary nature of such a
 * list: it deletes itself once every item is checked off.
 */

import { expect } from '@playwright/test';
import { test } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { TodosPage } from './TodosPage';
import { TemplatesPage } from './TemplatesPage';
import {
  addTemplateItem,
  createListTemplate,
  createProject,
  createTodo,
  deleteAllListTemplates,
  deleteAllProjects,
  deleteAllTodos,
  listProjects,
  listTodos,
} from './helpers';

test.describe('Todos list templates', () => {
  let todosPage: TodosPage;
  let templatesPage: TemplatesPage;

  test.beforeEach(async ({ adminToken, authenticatedAdminPage }) => {
    await deleteAllTodos(adminToken);
    await deleteAllProjects(adminToken);
    await deleteAllListTemplates(adminToken);
    todosPage = new TodosPage(authenticatedAdminPage);
    templatesPage = new TemplatesPage(authenticatedAdminPage);
  });

  test.afterEach(async ({ adminToken }) => {
    await deleteAllTodos(adminToken);
    await deleteAllProjects(adminToken);
    await deleteAllListTemplates(adminToken);
  });

  test('creates a template and manages its items on the templates page', async () => {
    await templatesPage.goto();
    await templatesPage.createTemplate('Camping Trip');

    await templatesPage.addItem('Camping Trip', 'Pack tent');
    await templatesPage.addItem('Camping Trip', 'Buy firewood');
    await templatesPage.expectItem('Camping Trip', 'Pack tent');
    await templatesPage.expectItem('Camping Trip', 'Buy firewood');

    await templatesPage.removeItem('Camping Trip', 'Buy firewood');
    await templatesPage.expectItemAbsent('Camping Trip', 'Buy firewood');
    await templatesPage.expectItem('Camping Trip', 'Pack tent');
  });

  test('instantiates a template into a new list from the templates page', async ({
    adminToken,
  }) => {
    const template = await createListTemplate(adminToken, {
      name: 'Camping Trip',
    });
    await addTemplateItem(adminToken, template.id, 'Pack tent');
    await addTemplateItem(adminToken, template.id, 'Buy firewood');

    await templatesPage.goto();
    await templatesPage.createListFrom('Camping Trip');

    // Lands on the new list with every template item as an active todo.
    await todosPage.expectInActive('Pack tent');
    await todosPage.expectInActive('Buy firewood');
  });

  test('instantiates a template from the project switcher picker', async ({
    adminToken,
  }) => {
    const template = await createListTemplate(adminToken, {
      name: 'Weekly Chores',
    });
    await addTemplateItem(adminToken, template.id, 'Vacuum');
    await addTemplateItem(adminToken, template.id, 'Laundry');

    await todosPage.goto();
    await todosPage.createListFromTemplate('Weekly Chores');

    await todosPage.expectInActive('Vacuum');
    await todosPage.expectInActive('Laundry');
  });

  test('a list made from a template is temporary and goes away once every item is checked off', async ({
    adminToken,
  }) => {
    const template = await createListTemplate(adminToken, {
      name: 'Packing',
    });
    await addTemplateItem(adminToken, template.id, 'Passport');
    await addTemplateItem(adminToken, template.id, 'Charger');

    await todosPage.goto();
    await todosPage.createListFromTemplate('Packing');
    await todosPage.expectActiveList('Packing');
    await todosPage.expectTemporaryBadge(true);
    const [project] = await listProjects(adminToken);
    expect(project.temporary).toBe(true);

    // One item down: the list is still here.
    await todosPage.markComplete('Passport');
    await todosPage.expectRowAbsent('Passport');
    await todosPage.expectActiveList('Packing');
    await todosPage.expectInActive('Charger');

    // The last one retires the list, todos included, and lands back on Main.
    await todosPage.markComplete('Charger');
    await todosPage.expectActiveList('Main');
    await expect.poll(() => listProjects(adminToken)).toEqual([]);
    await expect.poll(() => listTodos(adminToken)).toEqual([]);
    await todosPage.expectTemporaryBadge(false);
  });

  test('a list made by hand is not temporary and survives being finished', async ({
    adminToken,
  }) => {
    const project = await createProject(adminToken, { name: 'Garden' });
    await createTodo(adminToken, {
      title: 'Water plants',
      project_id: project.id,
    });

    await todosPage.goto();
    await todosPage.selectProject('Garden');
    await todosPage.expectTemporaryBadge(false);
    await todosPage.markComplete('Water plants');
    await todosPage.expectRowAbsent('Water plants');

    await todosPage.expectActiveList('Garden');
    await expect
      .poll(async () => (await listProjects(adminToken)).map((p) => p.name))
      .toEqual(['Garden']);
  });

  test('deletes a template', async () => {
    await templatesPage.goto();
    await templatesPage.createTemplate('One Off');
    await templatesPage.deleteTemplate('One Off');
    await templatesPage.expectTemplateAbsent('One Off');
  });
});
