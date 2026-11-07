import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import {
  OFFLINE_SHAPE_META,
  isKeptQuery,
  keptShapes,
  registerOfflineKeep,
  resourceShape,
} from '../offlineKeep';
import { salvageQueuedWrites } from '../persistQueryClient';
import { queryKeys } from '../queryClient';

const note = {
  singular: 'note',
  offline: 'keep' as const,
  parents: ['user'],
  fields: { body: { type: 'string' as const, required: true }, struck: { type: 'boolean' as const } },
};

describe('resourceShape', () => {
  it('ignores key order but changes with the fields', () => {
    const reordered = { ...note, fields: { struck: note.fields.struck, body: note.fields.body } };
    expect(resourceShape(reordered)).toBe(resourceShape(note));
    const grown = { ...note, fields: { ...note.fields, written_at: { type: 'string' as const } } };
    expect(resourceShape(grown)).not.toBe(resourceShape(note));
  });
});

describe('registerOfflineKeep', () => {
  it('stamps a kept list with its shape and never collects it', () => {
    const qc = new QueryClient();
    registerOfflineKeep(qc, 'notes', note);
    const defaults = qc.getQueryDefaults(queryKeys.app('notes').resource('note').list());
    expect(defaults.gcTime).toBe(Infinity);
    expect(defaults.meta?.[OFFLINE_SHAPE_META]).toBe(resourceShape(note));
  });

  it('leaves other resources alone', () => {
    const qc = new QueryClient();
    registerOfflineKeep(qc, 'todos', { singular: 'todo', fields: {} });
    expect(qc.getQueryDefaults(queryKeys.app('todos').resource('todo').list()).gcTime).toBeUndefined();
  });
});

describe('kept lists survive a stale snapshot', () => {
  const shapes = keptShapes([note, { singular: 'todo', fields: {} }]);
  const query = (key: unknown[], meta?: Record<string, unknown>) =>
    ({
      queryKey: key,
      queryHash: JSON.stringify(key),
      state: { data: [{ id: 'n1' }], status: 'success' },
      ...(meta ? { meta } : {}),
    }) as unknown as PersistedClient['clientState']['queries'][number];

  const kept = query(['app', 'notes', 'note', 'list'], { [OFFLINE_SHAPE_META]: resourceShape(note) });
  const oldShape = query(['app', 'notes', 'note', 'list'], { [OFFLINE_SHAPE_META]: 'old' });
  const detail = query(['app', 'notes', 'note', 'detail', 'n1'], { [OFFLINE_SHAPE_META]: resourceShape(note) });
  const other = query(['app', 'todos', 'todo', 'list']);

  it('matches only a kept list with the current shape', () => {
    expect(isKeptQuery(kept, shapes)).toBe(true);
    expect(isKeptQuery(oldShape, shapes)).toBe(false);
    expect(isKeptQuery(detail, shapes)).toBe(false);
    expect(isKeptQuery(other, shapes)).toBe(false);
  });

  it('keeps it through a new build, and past the age limit', () => {
    const snapshot: PersistedClient = {
      buster: 'build-1',
      timestamp: 0,
      clientState: { queries: [kept, oldShape, detail, other], mutations: [] },
    };
    const out = salvageQueuedWrites(snapshot, {
      buster: 'build-2',
      maxAge: 1000,
      now: 10_000,
      keep: (q) => isKeptQuery(q, shapes),
    });
    expect(out.clientState.queries).toEqual([kept]);
  });
});
