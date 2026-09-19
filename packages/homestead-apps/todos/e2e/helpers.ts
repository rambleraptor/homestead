/**
 * Todos E2E helpers — seed todos and projects via the aepbase REST API.
 */

import { deleteIfPresent, e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export type TodoStatus = 'pending' | 'do_later' | 'completed' | 'cancelled';

export interface TodoRecord {
  id: string;
  title: string;
  status: TodoStatus;
  project?: string;
  in_main?: boolean;
  category?: string;
}

export async function createTodo(
  token: string,
  data: {
    title: string;
    status?: TodoStatus;
    project_id?: string;
    in_main?: boolean;
    category_id?: string;
  },
): Promise<TodoRecord> {
  return e2eClient(token).collection<TodoRecord>('todos').create({
    title: data.title,
    status: data.status ?? 'pending',
    ...(data.project_id ? { project: `projects/${data.project_id}` } : {}),
    ...(data.in_main !== undefined ? { in_main: data.in_main } : {}),
    ...(data.category_id ? { category: data.category_id } : {}),
  });
}

export async function listTodos(token: string): Promise<TodoRecord[]> {
  return e2eClient(token).collection<TodoRecord>('todos').listAll();
}

export async function deleteAllTodos(token: string) {
  const items = await e2eClient(token).collection<{ id: string }>('todos').listAll();
  for (const item of items) {
    await deleteIfPresent(token, 'todos', item.id);
  }
}

export interface PersonalTodoRecord {
  id: string;
  title: string;
  status: TodoStatus;
  project?: string;
  in_main?: boolean;
  category?: string;
}

/** The current user's private todos live under `/users/{userId}/personal-todos`. */
function personalTodos(token: string, userId: string) {
  return e2eClient(token)
    .collection('users')
    .record(userId)
    .collection<PersonalTodoRecord>('personal-todos');
}

export async function createPersonalTodo(
  token: string,
  userId: string,
  data: {
    title: string;
    status?: TodoStatus;
    project_id?: string;
    in_main?: boolean;
  },
): Promise<PersonalTodoRecord> {
  return personalTodos(token, userId).create({
    title: data.title,
    status: data.status ?? 'pending',
    ...(data.project_id ? { project: `projects/${data.project_id}` } : {}),
    ...(data.in_main !== undefined ? { in_main: data.in_main } : {}),
  });
}

export async function listPersonalTodos(
  token: string,
  userId: string,
): Promise<PersonalTodoRecord[]> {
  return personalTodos(token, userId).listAll();
}

export async function deleteAllPersonalTodos(token: string, userId: string) {
  const items = await listPersonalTodos(token, userId);
  for (const item of items) {
    await personalTodos(token, userId)
      .record(item.id)
      .delete()
      .catch(() => undefined);
  }
}

export interface ProjectRecord {
  id: string;
  name: string;
  temporary?: boolean;
}

export async function createProject(
  token: string,
  data: { name: string; temporary?: boolean },
): Promise<ProjectRecord> {
  return e2eClient(token).collection<ProjectRecord>('projects').create({
    name: data.name,
    ...(data.temporary !== undefined ? { temporary: data.temporary } : {}),
  });
}

export async function listProjects(token: string): Promise<ProjectRecord[]> {
  return e2eClient(token).collection<ProjectRecord>('projects').listAll();
}

export async function deleteAllProjects(token: string) {
  const items = await e2eClient(token).collection<{ id: string }>('projects').listAll();
  for (const item of items) {
    // Force-cascade so category children are removed with the project.
    await deleteIfPresent(token, 'projects', item.id, { force: true });
  }
}

export interface CategoryRecord {
  id: string;
  name: string;
  position?: number;
}

/** Categories live under `/projects/{id}/categories`. */
export async function createCategory(
  token: string,
  projectId: string,
  data: { name: string; position?: number },
): Promise<CategoryRecord> {
  return e2eClient(token)
    .collection('projects')
    .record(projectId)
    .collection<CategoryRecord>('categories')
    .create({ name: data.name, position: data.position ?? 0 });
}

export async function listCategories(
  token: string,
  projectId: string,
): Promise<CategoryRecord[]> {
  return e2eClient(token)
    .collection('projects')
    .record(projectId)
    .collection<CategoryRecord>('categories')
    .listAll();
}

export interface ListTemplateRecord {
  id: string;
  name: string;
}

export async function createListTemplate(
  token: string,
  data: { name: string },
): Promise<ListTemplateRecord> {
  return e2eClient(token).collection<ListTemplateRecord>('list-templates').create({
    name: data.name,
  });
}

export async function addTemplateItem(
  token: string,
  templateId: string,
  title: string,
  templateCategoryId?: string,
): Promise<{ id: string; title: string; template_category?: string }> {
  return e2eClient(token)
    .collection('list-templates')
    .record(templateId)
    .collection<{ id: string; title: string; template_category?: string }>(
      'template-items',
    )
    .create({
      title,
      ...(templateCategoryId ? { template_category: templateCategoryId } : {}),
    });
}

export interface TemplateCategoryRecord {
  id: string;
  name: string;
  position?: number;
}

export async function addTemplateCategory(
  token: string,
  templateId: string,
  data: { name: string; position?: number },
): Promise<TemplateCategoryRecord> {
  return e2eClient(token)
    .collection('list-templates')
    .record(templateId)
    .collection<TemplateCategoryRecord>('template-categories')
    .create({ name: data.name, position: data.position ?? 0 });
}

export async function deleteAllListTemplates(token: string) {
  const items = await e2eClient(token).collection<{ id: string }>('list-templates').listAll();
  for (const item of items) {
    // Force the cascade so child template-items are removed with the parent.
    await deleteIfPresent(token, 'list-templates', item.id, { force: true });
  }
}
