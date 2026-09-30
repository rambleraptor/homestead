/**
 * Generic offline mutation factory — tested independently of any app.
 *
 * Mirrors the proven groceries scenarios (optimistic add, error rollback,
 * tempId reconciliation between create and a follow-up update/delete) but
 * against a synthetic "thingy" resource so failures point at the factory,
 * not at app-specific code.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '../aepbase';
import { NetworkError, resetConnectivityProbe } from '../connectivity';
import {
  clearResourceMetaRegistry,
  clearTempIdMaps,
  newTempId,
  registerResourceMutationDefaults,
  resourceMutationKeys,
  serverIdForTempId,
} from '../registerResourceMutationDefaults';
import { queryKeys } from '../queryClient';

interface Thingy {
  id: string;
  name: string;
  done?: boolean;
}

const KEYS = resourceMutationKeys('test-mod', 'thingy');
const LIST_KEY = queryKeys.app('test-mod').resource('thingy').list();
const DETAIL_KEY = (id: string) =>
  queryKeys.app('test-mod').resource('thingy').detail(id);

function makeClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  registerResourceMutationDefaults<Thingy, { name: string; tempId: string }>(client, {
    appId: 'test-mod',
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
  clearResourceMetaRegistry();
});

afterEach(() => {
  resetConnectivityProbe();
  onlineManager.setOnline(true);
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
    expect(aepbase.create).toHaveBeenCalledWith(
      'thingies',
      expect.objectContaining({ name: 'Foo' }),
      { id: serverIdForTempId(tempId) },
    );
  });

  it('sends a valid, deterministic server id derived from the temp id', () => {
    const tempId = newTempId();
    const id = serverIdForTempId(tempId);
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(id.length).toBeGreaterThanOrEqual(16);
    expect(serverIdForTempId(tempId)).toBe(id);
  });

  it('adopts the existing record when a replayed create hits a 409 on its own id', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const tempId = newTempId();
    const id = serverIdForTempId(tempId);
    vi.mocked(aepbase.create).mockRejectedValueOnce(
      new AepbaseError(409, 'already exists', '/thingies'),
    );
    vi.mocked(aepbase.get).mockResolvedValueOnce({ id, name: 'Foo' });

    await run(client, KEYS.create, { name: 'Foo', tempId });

    expect(aepbase.get).toHaveBeenCalledWith('thingies', id, {});
    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual([{ id, name: 'Foo' }]);
  });

  it('surfaces the 409 when no record with its id exists', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const conflict = new AepbaseError(409, 'conflict', '/thingies');
    vi.mocked(aepbase.create).mockRejectedValueOnce(conflict);
    vi.mocked(aepbase.get).mockRejectedValueOnce(new AepbaseError(404, 'nope', '/thingies/x'));

    await expect(run(client, KEYS.create, { name: 'Foo', tempId: newTempId() })).rejects.toBe(
      conflict,
    );
    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual([]);
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

/**
 * A detail view reads `queryKeys.app(appId).resource(singular).detail(id)`.
 * The settle-time invalidation only fires online, so the factory has to keep
 * that slot in step with the list itself — otherwise an edit shows in the list
 * and not on the record's own page.
 */
describe('detail cache slot', () => {
  it('primes the new record’s detail slot on create', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    vi.mocked(aepbase.create).mockResolvedValueOnce({ id: 'srv-1', name: 'Foo' });

    await run(client, KEYS.create, { name: 'Foo', tempId: newTempId() });

    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toMatchObject({
      id: 'srv-1',
      name: 'Foo',
    });
  });

  it('applies an update optimistically to the detail slot, then folds in the server copy', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), { id: 'srv-1', name: 'Foo' });

    let resolveUpdate!: () => void;
    vi.mocked(aepbase.update).mockImplementationOnce(
      () =>
        new Promise<Thingy>((res) => {
          resolveUpdate = () => res({ id: 'srv-1', name: 'Renamed', done: true });
        }),
    );

    const updatePromise = run(client, KEYS.update, {
      id: 'srv-1',
      data: { name: 'Renamed' },
    });

    // Optimistic: visible on the detail slot before the server answers.
    await vi.waitFor(() => {
      expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))?.name).toBe('Renamed');
    });

    resolveUpdate();
    await updatePromise;

    // Server-computed fields land without waiting for a refetch.
    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toMatchObject({
      name: 'Renamed',
      done: true,
    });
  });

  it('keeps the detail slot in step with the list while offline', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), { id: 'srv-1', name: 'Foo' });
    vi.mocked(aepbase.update).mockResolvedValueOnce({ id: 'srv-1', name: 'Renamed' });

    onlineManager.setOnline(false);
    const observer = new MutationObserver<Thingy | undefined, Error, unknown>(client, {
      mutationKey: KEYS.update as unknown[],
    });
    const pending = observer.mutate({ id: 'srv-1', data: { name: 'Renamed' } });

    await vi.waitFor(() => {
      expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))?.name).toBe('Renamed');
    });
    // The write is queued, not sent — and the detail view already agrees with
    // the list, with no invalidation available to reconcile them.
    expect(aepbase.update).not.toHaveBeenCalled();
    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0].name).toBe('Renamed');

    // The QueryClient auto-resumes paused mutations only once mounted, which
    // these unmounted-client tests never do — drain the queue by hand.
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
    await pending;
    observer.reset();
    expect(aepbase.update).toHaveBeenCalledWith('thingies', 'srv-1', {
      name: 'Renamed',
    });
  });

  it('rolls the detail slot back when the server rejects an update', async () => {
    const client = makeClient();
    const original: Thingy = { id: 'srv-1', name: 'Foo' };
    client.setQueryData<Thingy[]>(LIST_KEY, [original]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), original);
    vi.mocked(aepbase.update).mockRejectedValueOnce(new Error('boom'));

    await expect(
      run(client, KEYS.update, { id: 'srv-1', data: { name: 'Renamed' } }),
    ).rejects.toThrow();

    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toEqual(original);
  });

  it('drops the detail slot on delete and restores it when the server rejects', async () => {
    const client = makeClient();
    const original: Thingy = { id: 'srv-1', name: 'Foo' };
    client.setQueryData<Thingy[]>(LIST_KEY, [original]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), original);
    vi.mocked(aepbase.remove).mockResolvedValueOnce(undefined);

    await run(client, KEYS.delete, 'srv-1');
    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toBeUndefined();

    client.setQueryData<Thingy[]>(LIST_KEY, [original]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), original);
    vi.mocked(aepbase.remove).mockRejectedValueOnce(new Error('nope'));

    await expect(run(client, KEYS.delete, 'srv-1')).rejects.toThrow();
    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toEqual(original);
  });
});

describe('delete races', () => {
  it('treats a 404 as done instead of resurrecting the record', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    vi.mocked(aepbase.remove).mockRejectedValueOnce(
      new AepbaseError(404, 'not found', '/thingies/srv-1'),
    );

    await run(client, KEYS.delete, 'srv-1');

    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual([]);
  });
});

/**
 * Store wifi with no internet: the browser says online, but every request
 * fails before reaching the server. The write must queue, not roll back.
 */
describe('network failures', () => {
  it('pauses a write that never reached the server and replays it once back online', async () => {
    const client = makeClient();
    client.mount();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo', done: false }]);
    vi.mocked(aepbase.update)
      .mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')))
      .mockResolvedValueOnce({ id: 'srv-1', name: 'Foo', done: true });

    const pending = run(client, KEYS.update, { id: 'srv-1', data: { done: true } });

    // Flipped offline and parked in the queue, optimistic edit intact.
    await vi.waitFor(() => {
      expect(onlineManager.isOnline()).toBe(false);
      expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);
    }, { timeout: 3_000 });
    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0]?.done).toBe(true);

    onlineManager.setOnline(true);
    await pending;

    expect(aepbase.update).toHaveBeenCalledTimes(2);
    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0]?.done).toBe(true);
    client.unmount();
  });

  it('still rolls back on an HTTP error, which is an answer rather than an outage', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo', done: false }]);
    vi.mocked(aepbase.update).mockRejectedValueOnce(
      new AepbaseError(400, 'bad', '/thingies/srv-1'),
    );

    await expect(
      run(client, KEYS.update, { id: 'srv-1', data: { done: true } }),
    ).rejects.toThrow();

    expect(onlineManager.isOnline()).toBe(true);
    expect(aepbase.update).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0]?.done).toBe(false);
  });

  it('does not mistake a plain TypeError (a bug) for an outage', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    vi.mocked(aepbase.update).mockRejectedValueOnce(new TypeError('x is undefined'));

    await expect(
      run(client, KEYS.update, { id: 'srv-1', data: { name: 'Bar' } }),
    ).rejects.toThrow(TypeError);
    expect(onlineManager.isOnline()).toBe(true);
  });
});

describe('nested resources (convention-driven from `parents`)', () => {
  const CC = 'credit-cards';

  function makeNestedClient(): QueryClient {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    // Order is irrelevant — the walk consults the shared registry at mutate
    // time, by which point every resource has self-published its metadata.
    registerResourceMutationDefaults(client, {
      appId: CC,
      singular: 'credit-card',
      plural: 'credit-cards',
    });
    registerResourceMutationDefaults(client, {
      appId: CC,
      singular: 'perk',
      plural: 'perks',
      parents: ['credit-card'],
    });
    registerResourceMutationDefaults(client, {
      appId: CC,
      singular: 'redemption',
      plural: 'redemptions',
      parents: ['perk'],
    });
    return client;
  }

  it('creates a one-level child under its parent, stripping the FK from the body but keeping it on the optimistic record', async () => {
    const client = makeNestedClient();
    const perkList = queryKeys.app(CC).resource('perk').list();
    client.setQueryData(perkList, []);

    // Defer the server response so we can inspect the optimistic record while
    // the create is still in flight (before reconciliation replaces it).
    let resolveCreate!: () => void;
    vi.mocked(aepbase.create).mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveCreate = () => res({ id: 'perk-1', name: 'Dining' });
        }),
    );

    const createPromise = run(client, resourceMutationKeys(CC, 'perk').create, {
      credit_card: 'card-1',
      name: 'Dining',
      tempId: newTempId(),
    });

    // The optimistic record carries the FK for the compute-hook joins...
    await vi.waitFor(() => {
      const cached = client.getQueryData<Array<{ credit_card?: string }>>(perkList);
      expect(cached?.[0]?.credit_card).toBe('card-1');
    });

    // ...but the wire body has it stripped (it's path-encoded instead).
    expect(aepbase.create).toHaveBeenCalledWith(
      'perks',
      expect.objectContaining({ name: 'Dining' }),
      { parent: ['credit-cards', 'card-1'], id: expect.any(String) },
    );
    expect(vi.mocked(aepbase.create).mock.calls[0][1]).not.toHaveProperty('credit_card');

    resolveCreate();
    await createPromise;
  });

  it('creates a two-level grandchild by walking the parent cache for the grandparent id', async () => {
    const client = makeNestedClient();
    client.setQueryData(queryKeys.app(CC).resource('perk').list(), [
      { id: 'perk-1', credit_card: 'card-1', name: 'Dining' },
    ]);
    client.setQueryData(queryKeys.app(CC).resource('redemption').list(), []);
    vi.mocked(aepbase.create).mockResolvedValueOnce({ id: 'red-1', amount: 10 });

    await run(client, resourceMutationKeys(CC, 'redemption').create, {
      perk: 'perk-1',
      amount: 10,
      tempId: newTempId(),
    });

    expect(aepbase.create).toHaveBeenCalledWith(
      'redemptions',
      expect.objectContaining({ amount: 10 }),
      { parent: ['credit-cards', 'card-1', 'perks', 'perk-1'], id: expect.any(String) },
    );
    expect(vi.mocked(aepbase.create).mock.calls[0][1]).not.toHaveProperty('perk');
  });

  it('deletes a child using the parent chain resolved before optimistic removal', async () => {
    const client = makeNestedClient();
    client.setQueryData(queryKeys.app(CC).resource('perk').list(), [
      { id: 'perk-1', credit_card: 'card-1', name: 'Dining' },
    ]);
    vi.mocked(aepbase.remove).mockResolvedValueOnce(undefined);

    await run(client, resourceMutationKeys(CC, 'perk').delete, 'perk-1');

    expect(aepbase.remove).toHaveBeenCalledWith('perks', 'perk-1', {
      parent: ['credit-cards', 'card-1'],
      force: true,
    });
  });
});
