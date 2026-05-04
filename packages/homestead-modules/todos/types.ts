/**
 * Todo Module Types
 */

export type TodoStatus =
  | 'pending'
  | 'in_progress'
  | 'do_later'
  | 'completed'
  | 'cancelled';

export const TODO_STATUSES: readonly TodoStatus[] = [
  'pending',
  'in_progress',
  'do_later',
  'completed',
  'cancelled',
] as const;

/**
 * Todo record from aepbase. Matches the shape declared in
 * `packages/homestead-modules/todos/resources.ts`.
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
}

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
 * Three buckets the UI splits the list into. `active` covers `pending` and
 * `in_progress`; `doLater` covers `do_later`; `completed` covers both
 * `completed` and `cancelled`.
 */
export interface TodoBuckets {
  active: Todo[];
  doLater: Todo[];
  completed: Todo[];
}

/**
 * Progress percentages for the multi-segment bar (0-100).
 * Cancelled items are excluded from the denominator entirely.
 */
export interface TodoProgress {
  green: number;
  yellow: number;
}
