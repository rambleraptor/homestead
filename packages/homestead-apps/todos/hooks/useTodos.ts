/**
 * Todos Query Hooks
 *
 * The app draws from two collections: the household-global `todo` (family) and
 * the user-parented `personal-todo` (private to the current user). aepbase has
 * no `sort` query param, so we order client-side. Within each bucket we sort by
 * `create_time` ascending so the oldest item stays at the top — todometer-style.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useResourceList,
  byCreateTimeAsc,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { USERS } from '@rambleraptor/homestead-core/resources/builtins';
import { PERSONAL_TODOS, TODOS } from '../resources';
import { useProjects } from './useProjects';
import {
  MAIN_PROJECT_ID,
  type PersonalTodo,
  type ProjectScope,
  type Todo,
  type TodoBuckets,
  type TodoItem,
  type TodoStatus,
} from '../types';

/** The household-global (family) todos. */
export function useTodos() {
  return useResourceList<Todo>('todos', 'todo', TODOS, {
    sort: byCreateTimeAsc,
  });
}

/**
 * The current user's private todos, read from `/users/{me}/personal-todos`.
 * Disabled (and empty) when there's no authenticated user.
 */
export function usePersonalTodos() {
  const userId = aepbase.getCurrentUser()?.id;
  // User-parented reads need the parent path and can't use the generic
  // `useResourceList` (it has no `enabled` and always fetches, which would hit
  // the non-existent top-level `/personal-todos` when logged out). Keyed under
  // the todos app namespace so family mutations' app-wide invalidation refreshes
  // it too.
  return useQuery<PersonalTodo[], Error>({
    queryKey: queryKeys.app('todos').resource('personal-todo').list(),
    enabled: Boolean(userId),
    queryFn: async (): Promise<PersonalTodo[]> => {
      if (!userId) return [];
      const records = await aepbase.list<PersonalTodo>(PERSONAL_TODOS, {
        parent: [USERS, userId],
      });
      return [...records].sort(byCreateTimeAsc);
    },
  });
}

/**
 * The bare project id a todo is filed under, or '' when it's on main. The SPA
 * stores `project` as `projects/{id}`, but the chat/MCP tools write the bare
 * id, so compare placements through this rather than on the raw string.
 */
export function projectIdOf(todo: { project?: string }): string {
  return todo.project ? todo.project.replace(/^projects\//, '') : '';
}

/**
 * Filter a todo list — family or personal, they carry the same placement
 * fields — down to those visible in a given project scope.
 *
 * - Main scope: todos with no `project` field, plus todos pinned via
 *   `in_main=true`.
 * - Project scope: todos whose `project` names `scope` (as `projects/{scope}`
 *   or the bare id).
 *
 * `knownProjectIds`, when supplied, also pulls *orphans* onto main: a todo
 * filed under a list that no longer exists. Family todos are reassigned by the
 * delete itself (see useDeleteProject), but another member's private todo is
 * invisible to whoever deleted the list and can't be, so without this fallback
 * it would be stranded in a scope nothing can select. Omit the set while the
 * project list is still loading — an empty set would read every todo as an
 * orphan.
 */
export function filterTodosForScope<
  T extends { project?: string; in_main?: boolean },
>(
  todos: T[],
  scope: ProjectScope,
  knownProjectIds?: ReadonlySet<string>,
): T[] {
  if (scope === MAIN_PROJECT_ID) {
    return todos.filter(
      (t) =>
        !t.project ||
        t.in_main === true ||
        (knownProjectIds !== undefined && !knownProjectIds.has(projectIdOf(t))),
    );
  }
  return todos.filter((t) => projectIdOf(t) === scope);
}

/**
 * Merge family + personal todos for a scope into a single tagged list, sorted
 * by create_time so the two streams interleave chronologically.
 *
 * Both kinds are scoped by the same rule (see {@link filterTodosForScope}): a
 * private todo can be filed into a project list just like a shared one, and
 * only its owner ever sees it there.
 */
export function mergeTodosForScope(
  family: Todo[],
  personal: PersonalTodo[],
  scope: ProjectScope,
  knownProjectIds?: ReadonlySet<string>,
): TodoItem[] {
  const familyItems: TodoItem[] = filterTodosForScope(
    family,
    scope,
    knownProjectIds,
  ).map((t) => ({ ...t, kind: 'family' as const }));
  const personalItems: TodoItem[] = filterTodosForScope(
    personal,
    scope,
    knownProjectIds,
  ).map((t) => ({ ...t, kind: 'personal' as const }));
  return [...familyItems, ...personalItems].sort(byCreateTimeAsc);
}

/** A todo that is off the list for good — checked off or struck out. */
export function isDone(status: TodoStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/**
 * Whether moving `todoId` to `status` leaves nothing open in `todos` — i.e.
 * it is the last item in the list to be checked off. An empty list, or a
 * change that keeps the item open, never counts as finishing: a temporary
 * list with no items yet (a template with nothing in it) mustn't vanish on
 * arrival, and `do_later` is still on the list.
 */
export function finishesList(
  todos: readonly TodoItem[],
  todoId: string,
  status: TodoStatus,
): boolean {
  if (!isDone(status)) return false;
  if (todos.length === 0) return false;
  return todos.every((t) => t.id === todoId || isDone(t.status));
}

export function bucketTodos(todos: TodoItem[]): TodoBuckets {
  const active: TodoItem[] = [];
  const doLater: TodoItem[] = [];
  const completed: TodoItem[] = [];
  for (const t of todos) {
    if (t.status === 'do_later') doLater.push(t);
    else if (t.status === 'completed' || t.status === 'cancelled')
      completed.push(t);
    else active.push(t);
  }
  return { active, doLater, completed };
}

export function useTodoBuckets(scope: ProjectScope = MAIN_PROJECT_ID) {
  const family = useTodos();
  const personal = usePersonalTodos();
  // Shares the cache entry with every other `useProjects()` on the page, so
  // this costs no extra request. Only used to recognise orphans, so it stays
  // undefined until the list has actually resolved.
  const projects = useProjects();
  const knownProjectIds = useMemo<ReadonlySet<string> | undefined>(
    () => (projects.data ? new Set(projects.data.map((p) => p.id)) : undefined),
    [projects.data],
  );

  const scoped = useMemo<TodoItem[]>(
    () =>
      mergeTodosForScope(
        family.data ?? [],
        personal.data ?? [],
        scope,
        knownProjectIds,
      ),
    [family.data, personal.data, scope, knownProjectIds],
  );
  const buckets = useMemo<TodoBuckets>(() => bucketTodos(scoped), [scoped]);
  return {
    scoped,
    buckets,
    isLoading: family.isLoading || personal.isLoading,
    isError: family.isError || personal.isError,
    error: family.error ?? personal.error,
    refetch: async () => {
      await Promise.all([family.refetch(), personal.refetch()]);
    },
  };
}
