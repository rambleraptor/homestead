/**
 * The household's momentum from the todos in the cache: family and personal,
 * completed ones only. A todo's `update_time` stands in for when it was
 * finished — completion is the last thing that happens to a todo, so the two
 * coincide for all but an edit made after the fact.
 */

import { useMemo } from 'react';
import { computeMomentum, type Momentum } from '../momentum';
import type { PersonalTodo, Todo } from '../types';
import { usePersonalTodos, useTodos } from './useTodos';

/** When each completed todo in a list was finished. */
export function completionTimes(todos: ReadonlyArray<Todo | PersonalTodo>): string[] {
  return todos.filter((todo) => todo.status === 'completed').map((todo) => todo.update_time);
}

export function useMomentum(): Momentum & { isLoading: boolean } {
  const family = useTodos();
  const personal = usePersonalTodos();
  const momentum = useMemo(
    () =>
      computeMomentum(
        [...completionTimes(family.data ?? []), ...completionTimes(personal.data ?? [])],
        new Date(),
      ),
    [family.data, personal.data],
  );
  return { ...momentum, isLoading: family.isLoading || personal.isLoading };
}
