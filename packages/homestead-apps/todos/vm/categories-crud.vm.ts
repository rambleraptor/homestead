/**
 * Todo categories, on the VM tier — per-list managed categories on project
 * lists and templates.
 *
 * A port of the Playwright categories-crud spec. Uses the admin session
 * (categories live on the household `todo` / `project` resources, so superuser
 * access is fine here). Each test boots from a fresh copy of the template
 * database, so there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { TodosPage } from '../e2e/TodosPage';
import { TemplatesPage } from '../e2e/TemplatesPage';
import {
  addTemplateCategory,
  addTemplateItem,
  createCategory,
  createListTemplate,
  createProject,
} from '../e2e/helpers';

describe('Todo categories', () => {
  let h: Harness;
  let adminToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: adminToken } = await h.loginAs(h.admin));
  });

  afterEach(async () => {
    await h.close();
  });

  test('groups todos by category and un-categorizes on delete', async () => {
    const project = await createProject(adminToken, { name: 'Party' });
    await createCategory(adminToken, project.id, { name: 'Food', position: 0 });
    await createCategory(adminToken, project.id, { name: 'Fun', position: 1 });

    const todos = new TodosPage(h.driver);
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

  test('instantiating a template carries its categories into the new list', async () => {
    const template = await createListTemplate(adminToken, { name: 'Camping' });
    const gear = await addTemplateCategory(adminToken, template.id, {
      name: 'Gear',
      position: 0,
    });
    await addTemplateItem(adminToken, template.id, 'Tent', gear.id);
    await addTemplateItem(adminToken, template.id, 'Snacks');

    const templates = new TemplatesPage(h.driver);
    await templates.goto();
    await templates.createListFrom('Camping');

    // Instantiation navigates to the new list; its category + assignment carry.
    const todos = new TodosPage(h.driver);
    await todos.expectCategoryGroupVisible('Gear');
    await todos.expectTodoInGroup('Gear', 'Tent');
    await todos.expectRowVisible('Snacks');
  });
});
