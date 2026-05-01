/**
 * Todos Query Hook
 *
 * aepbase has no `sort` query param, so we order client-side. Within each
 * bucket we sort by `create_time` ascending so the oldest item stays at the
 * top — todometer-style.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { Todo, TodoBuckets, TodoProgress } from '../types';

export function useTodos() {
  return useQuery({
    queryKey: queryKeys.module('todos').list(),
    queryFn: async (): Promise<Todo[]> => {
      const todos = await aepbase.list<Todo>(AepCollections.TODOS);
      return todos.sort((a, b) =>
        (a.create_time || '').localeCompare(b.create_time || ''),
      );
    },
  });
}

export function bucketTodos(todos: Todo[]): TodoBuckets {
  const active: Todo[] = [];
  const doLater: Todo[] = [];
  const completed: Todo[] = [];
  for (const t of todos) {
    if (t.status === 'do_later') doLater.push(t);
    else if (t.status === 'completed' || t.status === 'cancelled')
      completed.push(t);
    else active.push(t);
  }
  return { active, doLater, completed };
}

/**
 * Derive the two-segment progress bar values from the full todo list.
 *
 * - Cancelled items are excluded from both numerator and denominator.
 * - Completed items contribute to the green segment.
 * - In-progress items contribute to the yellow segment.
 * - Pending and do_later items count toward the denominator only.
 */
export function computeProgress(todos: Todo[]): TodoProgress {
  const denom = todos.filter((t) => t.status !== 'cancelled').length;
  if (denom === 0) return { green: 0, yellow: 0 };
  const green =
    (todos.filter((t) => t.status === 'completed').length / denom) * 100;
  const yellow =
    (todos.filter((t) => t.status === 'in_progress').length / denom) * 100;
  return { green, yellow };
}

export function useTodoBuckets() {
  const query = useTodos();
  const buckets = useMemo<TodoBuckets>(
    () => bucketTodos(query.data ?? []),
    [query.data],
  );
  const progress = useMemo<TodoProgress>(
    () => computeProgress(query.data ?? []),
    [query.data],
  );
  return { ...query, buckets, progress };
}
