import { describe, it, expect } from 'vitest';
import type { RemoteChange } from '@rambleraptor/homestead-core/api/remoteChanges';
import type { Todo } from '../types';
import { describeTodoChange } from '../hooks/useTodoChangeToasts';

type Row = Pick<Todo, 'title' | 'status'>;

function change(overrides: Partial<RemoteChange<Row>>): RemoteChange<Row> {
  return {
    kind: 'updated',
    resource: 'todo',
    id: 't1',
    path: 'todos/t1',
    actor: 'users/sam',
    actorName: 'Sam',
    byMe: false,
    time: '2026-10-22T00:00:00Z',
    ...overrides,
  };
}

const bins: Row = { title: 'Take out the bins', status: 'pending' };

describe('describeTodoChange', () => {
  it('says what happened to the todo', () => {
    expect(describeTodoChange(change({ kind: 'created', record: bins }))).toBe(
      'Sam added Take out the bins',
    );
    expect(
      describeTodoChange(change({ record: { ...bins, status: 'completed' }, previous: bins })),
    ).toBe('Sam completed Take out the bins');
    expect(
      describeTodoChange(change({ record: { ...bins, status: 'do_later' }, previous: bins })),
    ).toBe('Sam moved Take out the bins to Do Later');
    expect(
      describeTodoChange(change({ record: bins, previous: { ...bins, status: 'do_later' } })),
    ).toBe('Sam moved Take out the bins back to the list');
    expect(describeTodoChange(change({ record: bins, previous: bins }))).toBe(
      'Sam updated Take out the bins',
    );
  });

  it('names a deleted todo from the copy this tab had', () => {
    expect(describeTodoChange(change({ kind: 'deleted', previous: bins }))).toBe(
      'Sam removed Take out the bins',
    );
    expect(describeTodoChange(change({ kind: 'deleted' }))).toBeNull();
  });
});
