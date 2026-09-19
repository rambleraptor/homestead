/**
 * Todo App Types
 */

export type TodoStatus = 'pending' | 'do_later' | 'completed' | 'cancelled';

export const TODO_STATUSES: readonly TodoStatus[] = [
  'pending',
  'do_later',
  'completed',
  'cancelled',
] as const;

/**
 * Todo record from aepbase. Matches the shape declared in
 * `packages/homestead-apps/todos/resources.ts`.
 */
export interface Todo {
  id: string;
  path: string;
  title: string;
  status: TodoStatus;
  created_by?: string;
  create_time: string;
  update_time: string;
  /** 'projects/{id}'. Empty/missing means the main project. */
  project?: string;
  /** When true, the todo also appears on the main view. */
  in_main?: boolean;
  /** Category record id (within the project). Empty/missing = uncategorized. */
  category?: string;
}

/**
 * Which collection a todo lives in. `family` todos are the household-global
 * `todo` resource (visible to everyone); `personal` todos are the
 * user-parented `personal-todo` resource (visible only to their owner).
 */
export type TodoKind = 'family' | 'personal';

/**
 * A private, per-user todo. Stored under `/users/{uid}/personal-todos/{id}`,
 * so ownership is encoded in the URL rather than a `created_by` field.
 *
 * It carries the same `project` / `in_main` / `category` placement fields as a
 * family {@link Todo}, so a private item can be filed into a project list
 * alongside shared ones — the list is shared, the item in it is not. Only its
 * owner ever sees it, in any scope.
 */
export interface PersonalTodo {
  id: string;
  path: string;
  title: string;
  status: TodoStatus;
  create_time: string;
  update_time: string;
  /** 'projects/{id}'. Empty/missing means the main list. */
  project?: string;
  /** When true, the todo also appears on the main view. */
  in_main?: boolean;
  /** Category record id (within the project). Empty/missing = uncategorized. */
  category?: string;
}

/**
 * Unified in-memory shape the UI renders. Family and personal todos are merged
 * into a single list; `kind` tags each one's origin so rendering (the kind
 * marker) and mutation routing (which collection to write) can branch on it.
 * `created_by` is only ever present on family todos — the two kinds otherwise
 * carry the same placement fields.
 */
export type TodoItem = Todo & { kind: TodoKind };

export interface TodoFormData {
  title: string;
}

/**
 * Project record from aepbase.
 */
export interface Project {
  id: string;
  path: string;
  name: string;
  created_by?: string;
  /**
   * A temporary list is deleted, todos and all, the moment its last open item
   * is checked off. Lists instantiated from a template are temporary; lists
   * made by hand are not.
   */
  temporary?: boolean;
  create_time: string;
  update_time: string;
}

/**
 * A named grouping of todos within a project list. Stored as a child of the
 * project (`/projects/{id}/categories/{id}`), so the project id lives in the
 * URL rather than as a stored field.
 */
export interface Category {
  id: string;
  path: string;
  name: string;
  /** Sort order within the project (ascending). Undefined sorts last. */
  position?: number;
  create_time: string;
  update_time: string;
}

/**
 * A reusable checklist template. Instantiating one creates a new project
 * pre-filled with a `pending` todo for each of its items.
 */
export interface ListTemplate {
  id: string;
  path: string;
  name: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

/**
 * A single item within a {@link ListTemplate}. Stored as a child of the
 * template (`/list-templates/{id}/template-items/{id}`), so the parent id
 * lives in the URL rather than as a stored field.
 */
export interface TemplateItem {
  id: string;
  path: string;
  title: string;
  /** Template-category record id. Empty/missing = uncategorized. */
  template_category?: string;
  create_time: string;
  update_time: string;
}

export interface TemplateItemFormData {
  title: string;
}

/**
 * A named grouping of items within a {@link ListTemplate}. Stored as a child of
 * the template (`/list-templates/{id}/template-categories/{id}`). Recreated as a
 * project {@link Category} when the template is instantiated.
 */
export interface TemplateCategory {
  id: string;
  path: string;
  name: string;
  position?: number;
  create_time: string;
  update_time: string;
}

/**
 * Sentinel id for the implicit main project. The main project is not a real
 * record — it's the union of todos with no `project` field plus todos pinned
 * to main via `in_main=true`.
 */
export const MAIN_PROJECT_ID = '__main__' as const;

/**
 * The currently selected project view. Either `MAIN_PROJECT_ID` or a real
 * project record id.
 */
export type ProjectScope = string;

/**
 * Three buckets the UI splits the list into. `active` covers `pending`;
 * `doLater` covers `do_later`; `completed` covers both `completed` and
 * `cancelled`.
 */
export interface TodoBuckets {
  active: TodoItem[];
  doLater: TodoItem[];
  completed: TodoItem[];
}

/** Sentinel id for the implicit "Uncategorized" group. */
export const UNCATEGORIZED_ID = '__uncategorized__' as const;

/**
 * A category header plus the items grouped under it, for rendering a list
 * grouped by category. `id` is a real category id or {@link UNCATEGORIZED_ID};
 * `name` is null for the uncategorized group.
 */
export interface CategoryGroup<T> {
  id: string;
  name: string | null;
  items: T[];
}
