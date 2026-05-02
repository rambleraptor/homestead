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
}

export interface TodoFormData {
  title: string;
}

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
