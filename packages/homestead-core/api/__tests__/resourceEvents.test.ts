/**
 * Writing a change-feed event straight into the cache: when a list can be
 * patched in place, and when it has to fall back to a refetch.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../queryClient';
import {
  applyResourceEvent,
  clearListShapes,
  registerListShape,
  type ResourceEventData,
} from '../resourceEvents';

interface Item {
  id: string;
  name: string;
  checked?: boolean;
  label?: string;
}

const keys = queryKeys.app('groceries').resource('grocery');
const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);

function event(id: string, record?: Partial<Item>): ResourceEventData {
  return {
    resource: 'grocery',
    path: `groceries/${id}`,
    id,
    actor: 'users/sam',
    origin: 'other-tab',
    update_time: '2026-09-30T00:00:00Z',
    record: record ? ({ id, ...record } as Record<string, unknown>) : undefined,
  };
}

let qc: QueryClient;

beforeEach(() => {
  clearListShapes();
  qc = new QueryClient();
  qc.setQueryData<Item[]>(keys.list(), [
    { id: 'a', name: 'Apples' },
    { id: 'c', name: 'Cheese' },
  ]);
});

describe('applyResourceEvent', () => {
  it('inserts a created record in the list’s own shape and order', () => {
    registerListShape('groceries', 'grocery', {
      map: ((r: Item) => ({ ...r, label: r.name.toUpperCase() })) as (record: never) => unknown,
      comparator: byName as (a: never, b: never) => number,
      complete: true,
    });

    const applied = applyResourceEvent(qc, 'groceries', 'resource.created', event('b', { name: 'Bread' }));

    expect(applied).toBe(true);
    expect(qc.getQueryData<Item[]>(keys.list())).toEqual([
      { id: 'a', name: 'Apples' },
      { id: 'b', name: 'Bread', label: 'BREAD' },
      { id: 'c', name: 'Cheese' },
    ]);
  });

  it('replaces an updated record in place and refreshes an open detail view', () => {
    registerListShape('groceries', 'grocery', { complete: true });
    qc.setQueryData<Item>(keys.detail('a'), { id: 'a', name: 'Apples', label: 'kept' });

    applyResourceEvent(qc, 'groceries', 'resource.updated', event('a', { name: 'Apples', checked: true }));

    expect(qc.getQueryData<Item[]>(keys.list())?.[0]).toEqual({ id: 'a', name: 'Apples', checked: true });
    expect(qc.getQueryData<Item>(keys.detail('a'))).toEqual({
      id: 'a',
      name: 'Apples',
      checked: true,
      label: 'kept',
    });
  });

  it('removes a deleted record from the list and drops its detail slot', () => {
    qc.setQueryData<Item>(keys.detail('a'), { id: 'a', name: 'Apples' });

    const applied = applyResourceEvent(qc, 'groceries', 'resource.deleted', event('a'));

    expect(applied).toBe(true);
    expect(qc.getQueryData<Item[]>(keys.list())?.map((r) => r.id)).toEqual(['c']);
    expect(qc.getQueryData(keys.detail('a'))).toBeUndefined();
  });

  it('falls back when the list is filtered or its shape is unknown', () => {
    const created = event('b', { name: 'Bread' });
    expect(applyResourceEvent(qc, 'groceries', 'resource.created', created)).toBe(false);

    registerListShape('groceries', 'grocery', { complete: false });
    expect(applyResourceEvent(qc, 'groceries', 'resource.created', created)).toBe(false);
    expect(qc.getQueryData<Item[]>(keys.list())).toHaveLength(2);
  });

  it('leaves a record alone while this tab has its own write to it pending', async () => {
    registerListShape('groceries', 'grocery', { complete: true });
    let release!: () => void;
    const mutation = qc.getMutationCache().build(qc, {
      mutationFn: () => new Promise<void>((resolve) => (release = resolve)),
    });
    const running = mutation.execute({ id: 'a', data: { checked: true } });

    const applied = applyResourceEvent(qc, 'groceries', 'resource.updated', event('a', { name: 'Renamed' }));

    expect(applied).toBe(false);
    expect(qc.getQueryData<Item[]>(keys.list())?.[0]?.name).toBe('Apples');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await running;
  });

  it('counts as applied when nothing is cached to patch', () => {
    qc.removeQueries({ queryKey: keys.list() });
    expect(
      applyResourceEvent(qc, 'groceries', 'resource.created', event('b', { name: 'Bread' })),
    ).toBe(true);
  });
});
