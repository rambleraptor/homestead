import { describe, it, expect } from 'vitest';
import {
  bucketTodos,
  filterTodosForScope,
  finishesList,
  mergeTodosForScope,
} from '../hooks/useTodos';
import {
  MAIN_PROJECT_ID,
  type PersonalTodo,
  type Todo,
  type TodoItem,
  type TodoStatus,
} from '../types';

function makeTodo(
  id: string,
  status: TodoStatus,
  createTime = '2025-01-01T00:00:00Z',
  extra: Partial<Todo> = {},
): TodoItem {
  return {
    id,
    path: `todos/${id}`,
    title: `Todo ${id}`,
    status,
    create_time: createTime,
    update_time: createTime,
    kind: 'family',
    ...extra,
  };
}

function makePersonal(
  id: string,
  status: TodoStatus,
  createTime = '2025-01-01T00:00:00Z',
  extra: Partial<PersonalTodo> = {},
): PersonalTodo {
  return {
    id,
    path: `users/u1/personal-todos/${id}`,
    title: `Personal ${id}`,
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
      makeTodo('2', 'do_later'),
      makeTodo('3', 'completed'),
      makeTodo('4', 'cancelled'),
    ];
    const buckets = bucketTodos(todos);
    expect(buckets.active.map((t) => t.id)).toEqual(['1']);
    expect(buckets.doLater.map((t) => t.id)).toEqual(['2']);
    expect(buckets.completed.map((t) => t.id)).toEqual(['3', '4']);
  });

  it('returns three empty arrays for an empty list', () => {
    expect(bucketTodos([])).toEqual({ active: [], doLater: [], completed: [] });
  });
});

describe('finishesList', () => {
  it('is true when the change checks off the last open item', () => {
    const todos = [
      makeTodo('1', 'completed'),
      makeTodo('2', 'cancelled'),
      makeTodo('3', 'pending'),
    ];
    expect(finishesList(todos, '3', 'completed')).toBe(true);
    expect(finishesList(todos, '3', 'cancelled')).toBe(true);
  });

  it('is false while another item is still open', () => {
    const todos = [
      makeTodo('1', 'pending'),
      makeTodo('2', 'do_later'),
      makeTodo('3', 'pending'),
    ];
    expect(finishesList(todos, '3', 'completed')).toBe(false);
    // do_later is still on the list
    expect(finishesList([makeTodo('1', 'do_later'), makeTodo('2', 'pending')], '2', 'completed')).toBe(false);
  });

  it('is false when the change keeps the item open', () => {
    const todos = [makeTodo('1', 'pending')];
    expect(finishesList(todos, '1', 'do_later')).toBe(false);
    expect(finishesList(todos, '1', 'pending')).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(finishesList([], 'x', 'completed')).toBe(false);
  });

  it('only cares about the item being changed, not its stale status', () => {
    // The caller passes the pre-change list; the changed item's own recorded
    // status is irrelevant.
    const todos = [makeTodo('1', 'completed'), makeTodo('2', 'pending')];
    expect(finishesList(todos, '2', 'completed')).toBe(true);
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

  it('matches a todo whose project is stored as the bare id', () => {
    // The chat/MCP tools write reference fields as bare ids, not the
    // `projects/{id}` path the SPA writes — the todo must still be on its list,
    // and must not also leak onto main.
    const bare = makeTodo('e', 'pending', '2025-01-01T00:00:00Z', {
      project: 'p1',
    });
    const known = new Set(['p1', 'p2']);
    expect(filterTodosForScope([...todos, bare], 'p1').map((t) => t.id)).toEqual(
      ['b', 'c', 'e'],
    );
    expect(
      filterTodosForScope([...todos, bare], MAIN_PROJECT_ID, known).map(
        (t) => t.id,
      ),
    ).toEqual(['a', 'c']);
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

  it('main scope: rescues a todo whose list no longer exists', () => {
    // Nobody can select a deleted list, so a todo left pointing at one would
    // be unreachable. Deleting a list reassigns the todos the deleter can see;
    // another member's private ones it cannot, and they land here.
    const orphan = makeTodo('o', 'pending', '2025-01-01T00:00:00Z', {
      project: 'projects/deleted',
    });
    const known = new Set(['p1', 'p2']);
    expect(
      filterTodosForScope([...todos, orphan], MAIN_PROJECT_ID, known).map(
        (t) => t.id,
      ),
    ).toEqual(['a', 'c', 'o']);
  });

  it('main scope: keeps filed todos where they are when the lists are known', () => {
    const known = new Set(['p1', 'p2']);
    expect(
      filterTodosForScope(todos, MAIN_PROJECT_ID, known).map((t) => t.id),
    ).toEqual(['a', 'c']);
  });

  it('main scope: treats no known-id set as "lists still loading", not "no lists"', () => {
    // An empty set would read every filed todo as an orphan and dump the whole
    // household onto main for a frame.
    expect(
      filterTodosForScope(todos, MAIN_PROJECT_ID, undefined).map((t) => t.id),
    ).toEqual(['a', 'c']);
  });
});

describe('mergeTodosForScope', () => {
  const family: Todo[] = [
    makeTodo('fa', 'pending', '2025-01-01T00:00:00Z'),
    makeTodo('fb', 'pending', '2025-01-03T00:00:00Z', {
      project: 'projects/p1',
    }),
    makeTodo('fc', 'pending', '2025-01-04T00:00:00Z', {
      project: 'projects/p1',
      in_main: true,
    }),
  ];
  const personal: PersonalTodo[] = [
    makePersonal('pa', 'pending', '2025-01-02T00:00:00Z'),
    makePersonal('pb', 'pending', '2025-01-05T00:00:00Z'),
  ];

  it('main scope: merges family-on-main with all personal, tagged by kind', () => {
    const merged = mergeTodosForScope(family, personal, MAIN_PROJECT_ID);
    // fa (no project) + fc (pinned) are the family-on-main set; both personal.
    expect(merged.map((t) => t.id)).toEqual(['fa', 'pa', 'fc', 'pb']);
    expect(merged.map((t) => t.kind)).toEqual([
      'family',
      'personal',
      'family',
      'personal',
    ]);
  });

  it('main scope: interleaves the two streams by create_time', () => {
    const merged = mergeTodosForScope(family, personal, MAIN_PROJECT_ID);
    const times = merged.map((t) => t.create_time);
    expect(times).toEqual([...times].sort());
  });

  it('project scope: includes only the todos filed under that list', () => {
    const merged = mergeTodosForScope(family, personal, 'p1');
    expect(merged.map((t) => t.id)).toEqual(['fb', 'fc']);
    expect(merged.every((t) => t.kind === 'family')).toBe(true);
  });

  it('project scope: a private todo filed under the list appears in it', () => {
    const filed = makePersonal('pc', 'pending', '2025-01-06T00:00:00Z', {
      project: 'projects/p1',
    });
    const merged = mergeTodosForScope(family, [...personal, filed], 'p1');
    expect(merged.map((t) => t.id)).toEqual(['fb', 'fc', 'pc']);
    expect(merged.find((t) => t.id === 'pc')?.kind).toBe('personal');
  });

  it('main scope: a private todo filed under a list stays out of main', () => {
    const filed = makePersonal('pc', 'pending', '2025-01-06T00:00:00Z', {
      project: 'projects/p1',
    });
    const merged = mergeTodosForScope(
      family,
      [...personal, filed],
      MAIN_PROJECT_ID,
    );
    expect(merged.map((t) => t.id)).not.toContain('pc');
  });

  it('main scope: a private todo pinned from a list shows on main too', () => {
    const pinned = makePersonal('pc', 'pending', '2025-01-06T00:00:00Z', {
      project: 'projects/p1',
      in_main: true,
    });
    const merged = mergeTodosForScope(
      family,
      [...personal, pinned],
      MAIN_PROJECT_ID,
    );
    expect(merged.map((t) => t.id)).toContain('pc');
  });

  it('handles empty inputs', () => {
    expect(mergeTodosForScope([], [], MAIN_PROJECT_ID)).toEqual([]);
  });
});
