import { describe, it, expect } from 'vitest';
import {
  bucketTodos,
  computeProgress,
  filterTodosForScope,
} from '../hooks/useTodos';
import { MAIN_PROJECT_ID, type Todo, type TodoStatus } from '../types';

function makeTodo(
  id: string,
  status: TodoStatus,
  createTime = '2025-01-01T00:00:00Z',
  extra: Partial<Todo> = {},
): Todo {
  return {
    id,
    path: `todos/${id}`,
    title: `Todo ${id}`,
    status,
    create_time: createTime,
    update_time: createTime,
    ...extra,
  };
}

describe('bucketTodos', () => {
  it('splits by status into active / doLater / completed', () => {
    const todos: Todo[] = [
      makeTodo('1', 'pending'),
      makeTodo('2', 'in_progress'),
      makeTodo('3', 'do_later'),
      makeTodo('4', 'completed'),
      makeTodo('5', 'cancelled'),
    ];
    const buckets = bucketTodos(todos);
    expect(buckets.active.map((t) => t.id)).toEqual(['1', '2']);
    expect(buckets.doLater.map((t) => t.id)).toEqual(['3']);
    expect(buckets.completed.map((t) => t.id)).toEqual(['4', '5']);
  });

  it('returns three empty arrays for an empty list', () => {
    expect(bucketTodos([])).toEqual({ active: [], doLater: [], completed: [] });
  });
});

describe('computeProgress', () => {
  it('returns zeros when there are no todos', () => {
    expect(computeProgress([])).toEqual({ green: 0, yellow: 0 });
  });

  it('returns zeros when every todo is cancelled (denominator excludes them)', () => {
    expect(
      computeProgress([makeTodo('1', 'cancelled'), makeTodo('2', 'cancelled')]),
    ).toEqual({ green: 0, yellow: 0 });
  });

  it('returns 100% green when every non-cancelled todo is completed', () => {
    const result = computeProgress([
      makeTodo('1', 'completed'),
      makeTodo('2', 'completed'),
    ]);
    expect(result.green).toBe(100);
    expect(result.yellow).toBe(0);
  });

  it('splits between green and yellow correctly', () => {
    const result = computeProgress([
      makeTodo('1', 'completed'),
      makeTodo('2', 'in_progress'),
      makeTodo('3', 'pending'),
      makeTodo('4', 'do_later'),
    ]);
    expect(result.green).toBe(25);
    expect(result.yellow).toBe(25);
  });

  it('excludes cancelled todos from the denominator', () => {
    const result = computeProgress([
      makeTodo('1', 'completed'),
      makeTodo('2', 'pending'),
      makeTodo('3', 'cancelled'),
    ]);
    expect(result.green).toBe(50);
    expect(result.yellow).toBe(0);
  });
});

describe('filterTodosForScope', () => {
  const todos: Todo[] = [
    makeTodo('a', 'pending'),
    makeTodo('b', 'pending', '2025-01-01T00:00:00Z', {
      project: 'projects/p1',
    }),
    makeTodo('c', 'pending', '2025-01-01T00:00:00Z', {
      project: 'projects/p1',
      in_main: true,
    }),
    makeTodo('d', 'pending', '2025-01-01T00:00:00Z', {
      project: 'projects/p2',
    }),
  ];

  it('main scope: includes todos without a project plus pinned ones', () => {
    expect(filterTodosForScope(todos, MAIN_PROJECT_ID).map((t) => t.id)).toEqual(
      ['a', 'c'],
    );
  });

  it('project scope: includes only todos belonging to that project', () => {
    expect(filterTodosForScope(todos, 'p1').map((t) => t.id)).toEqual(['b', 'c']);
    expect(filterTodosForScope(todos, 'p2').map((t) => t.id)).toEqual(['d']);
  });

  it('returns an empty array when no todos match the scope', () => {
    expect(filterTodosForScope(todos, 'nope')).toEqual([]);
  });

  it('main scope includes pinned todos even when their project is unknown', () => {
    const pinned = makeTodo('e', 'pending', '2025-01-01T00:00:00Z', {
      project: 'projects/deleted',
      in_main: true,
    });
    expect(
      filterTodosForScope([...todos, pinned], MAIN_PROJECT_ID).map((t) => t.id),
    ).toEqual(['a', 'c', 'e']);
  });
});
