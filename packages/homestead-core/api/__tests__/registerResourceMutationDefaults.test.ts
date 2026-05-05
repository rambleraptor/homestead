/**
 * Generic offline mutation factory — tested independently of any module.
 *
 * Mirrors the proven groceries scenarios (optimistic add, error rollback,
 * tempId reconciliation between create and a follow-up update/delete) but
 * against a synthetic "thingy" resource so failures point at the factory,
 * not at module-specific code.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { aepbase } from '../aepbase';
import {
  clearTempIdMaps,
  newTempId,
  registerResourceMutationDefaults,
  resourceMutationKeys,
} from '../registerResourceMutationDefaults';
import { queryKeys } from '../queryClient';

interface Thingy {
  id: string;
  name: string;
  done?: boolean;
}

const KEYS = resourceMutationKeys('test-mod', 'thingy');
const LIST_KEY = queryKeys.module('test-mod').resource('thingy').list();

function makeClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  registerResourceMutationDefaults<Thingy, { name: string; tempId: string }>(client, {
    moduleId: 'test-mod',
    singular: 'thingy',
    plural: 'thingies',
  });
  return client;
}

async function run<TData = unknown, TVars = unknown>(
  client: QueryClient,
  mutationKey: readonly unknown[],
  variables: TVars,
): Promise<TData> {
  const observer = new MutationObserver<TData, Error, TVars>(client, {
    mutationKey: mutationKey as unknown[],
  });
  try {
    return await observer.mutate(variables);
  } finally {
    observer.reset();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  clearTempIdMaps();
});

describe('create', () => {
  it('inserts an optimistic record and reconciles to the server id on success', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    vi.mocked(aepbase.create).mockResolvedValueOnce({ id: 'srv-1', name: 'Foo' });

    const tempId = newTempId();
    await run(client, KEYS.create, { name: 'Foo', tempId });

    const list = client.getQueryData<Thingy[]>(LIST_KEY) ?? [];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('srv-1');
    expect(aepbase.create).toHaveBeenCalledWith('thingies', expect.objectContaining({ name: 'Foo' }));
  });

  it('rolls back the cache when the server rejects', async () => {
    const client = makeClient();
    const seed: Thingy[] = [{ id: 'pre', name: 'Pre' }];
    client.setQueryData<Thingy[]>(LIST_KEY, seed);
    vi.mocked(aepbase.create).mockRejectedValueOnce(new Error('boom'));

    await expect(
      run(client, KEYS.create, { name: 'New', tempId: newTempId() }),
    ).rejects.toThrow();

    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual(seed);
  });
});

describe('update tempId reconciliation', () => {
  it('rewrites a follow-up update from tempId to the server id', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    vi.mocked(aepbase.create).mockResolvedValueOnce({ id: 'srv-2', name: 'Bar' });
    vi.mocked(aepbase.update).mockResolvedValueOnce({ id: 'srv-2', name: 'Bar', done: true });

    const tempId = newTempId();
    await run(client, KEYS.create, { name: 'Bar', tempId });
    await run(client, KEYS.update, { id: tempId, data: { done: true } });

    expect(aepbase.update).toHaveBeenCalledWith('thingies', 'srv-2', { done: true });
  });
});

describe('delete tempId reconciliation', () => {
  it('cancels a pending create when delete fires before it resolves', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);

    let resolveCreate!: () => void;
    vi.mocked(aepbase.create).mockImplementationOnce(
      () =>
        new Promise<Thingy>((res) => {
          resolveCreate = () => res({ id: 'srv-3', name: 'Baz' });
        }),
    );

    const tempId = newTempId();
    const createPromise = run(client, KEYS.create, { name: 'Baz', tempId });

    await vi.waitFor(() => {
      expect(client.getQueryData<Thingy[]>(LIST_KEY) ?? []).toHaveLength(1);
    });

    await run(client, KEYS.delete, tempId);

    expect(aepbase.remove).not.toHaveBeenCalled();
    expect(client.getQueryData<Thingy[]>(LIST_KEY) ?? []).toHaveLength(0);

    resolveCreate();
    await createPromise.catch(() => undefined);
  });
});

describe('cascadeDelete', () => {
  it('runs the optimistic cascade on delete and reverses it on error', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    const otherKey = ['module', 'test-mod', 'detail', 'others'] as const;
    registerResourceMutationDefaults<Thingy, { name: string; tempId: string }>(client, {
      moduleId: 'test-mod',
      singular: 'thingy',
      plural: 'thingies',
      cascadeDelete: {
        apply(_id, qc) {
          const snap = qc.getQueryData<string[]>(otherKey) ?? [];
          qc.setQueryData<string[]>(otherKey, []);
          return snap;
        },
        rollback(snap, qc) {
          qc.setQueryData<string[]>(otherKey, snap as string[]);
        },
      },
    });

    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 's-1', name: 'Foo' }]);
    client.setQueryData<string[]>(otherKey, ['x', 'y']);
    vi.mocked(aepbase.remove).mockRejectedValueOnce(new Error('forbidden'));

    await expect(run(client, KEYS.delete, 's-1')).rejects.toThrow();

    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual([{ id: 's-1', name: 'Foo' }]);
    expect(client.getQueryData<string[]>(otherKey)).toEqual(['x', 'y']);
  });
});
