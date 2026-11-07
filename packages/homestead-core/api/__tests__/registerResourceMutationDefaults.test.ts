/**
 * Generic offline mutation factory — tested independently of any app.
 *
 * Writes go through the page's outbox to the (mocked) aepbase client, so these
 * pin the whole path a write takes: the optimistic cache change, the AEP
 * request it becomes (AEP-133 create with a client-chosen id, AEP-134 merge
 * patch, AEP-135 delete — each addressed by an AEP-122 resource name), and
 * what the server's answer does to the cache. A synthetic "thingy" resource
 * keeps failures pointing at the factory, not an app.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';
import { aepbase, AepbaseError } from '../aepbase';
import { NetworkError, resetConnectivityProbe } from '../connectivity';
import { outbox } from '../outbox';
import {
  clearResourceMetaRegistry,
  newRecordId,
  registerResourceMutationDefaults,
  resourceMutationKeys,
  resourceNameFromCache,
  overlayPendingWrites,
  serverIdForTempId,
  syncCacheWithOutbox,
  withPendingWrites,
} from '../registerResourceMutationDefaults';
import { queryKeys } from '../queryClient';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

interface Thingy {
  id: string;
  name: string;
  done?: boolean;
  path?: string;
}

const KEYS = resourceMutationKeys('test-mod', 'thingy');
const LIST_KEY = queryKeys.app('test-mod').resource('thingy').list();
const DETAIL_KEY = (id: string) => queryKeys.app('test-mod').resource('thingy').detail(id);

function makeClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  registerResourceMutationDefaults<Thingy>(client, {
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

/** An AEP server: a create answers with the id it was given, under its parent. */
function echoServer(): void {
  vi.mocked(aepbase.create).mockImplementation(async (plural, body, options = {}) => {
    const opts = options as { id?: string; parent?: string[] };
    const path = [...(opts.parent ?? []), plural, opts.id].join('/');
    return { id: opts.id, path, ...(body as object) };
  });
  vi.mocked(aepbase.update).mockImplementation(async (plural, id, body) => ({
    id,
    path: `${plural}/${id}`,
    ...(body as object),
  }));
  vi.mocked(aepbase.remove).mockResolvedValue(undefined);
}

beforeEach(async () => {
  vi.clearAllMocks();
  clearResourceMetaRegistry();
  await outbox.clear();
  echoServer();
});

afterEach(async () => {
  resetConnectivityProbe();
  onlineManager.setOnline(true);
  await outbox.clear();
});

describe('create (AEP-133)', () => {
  it('sends the id chosen up front, and the optimistic record already has it', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const recordId = newRecordId();

    await run(client, KEYS.create, { name: 'Foo', recordId });

    expect(aepbase.create).toHaveBeenCalledWith(
      'thingies',
      expect.objectContaining({ name: 'Foo' }),
      { id: recordId },
    );
    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual([
      expect.objectContaining({ id: recordId, path: `thingies/${recordId}`, name: 'Foo' }),
    ]);
  });

  it('chooses ids that are valid AEP-122 resource ids', () => {
    expect(newRecordId()).toMatch(/^[a-z0-9]+$/);
    expect(newRecordId()).not.toBe(newRecordId());
  });

  it('replays an earlier version’s tmp_ create with the id that version sent', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const tempId = 'tmp_6F1C2D3E-4A5B-6C7D-8E9F-0A1B2C3D4E5F';

    await run(client, KEYS.create, { name: 'Foo', tempId });

    expect(aepbase.create).toHaveBeenCalledWith('thingies', expect.anything(), {
      id: serverIdForTempId(tempId),
    });
    expect(vi.mocked(aepbase.create).mock.calls[0]![1]).not.toHaveProperty('tempId');
  });

  it('adopts the existing record when a replayed create hits a 409 on its own id', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const recordId = newRecordId();
    vi.mocked(aepbase.create).mockRejectedValueOnce(new AepbaseError(409, 'exists', '/thingies'));
    vi.mocked(aepbase.get).mockResolvedValueOnce({ id: recordId, name: 'Foo (server)' });

    await run(client, KEYS.create, { name: 'Foo', recordId });

    expect(aepbase.get).toHaveBeenCalledWith('thingies', recordId, {});
    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0]?.name).toBe('Foo (server)');
  });

  it('rolls back the cache when the server rejects', async () => {
    const client = makeClient();
    const seed: Thingy[] = [{ id: 'pre', name: 'Pre' }];
    client.setQueryData<Thingy[]>(LIST_KEY, seed);
    vi.mocked(aepbase.create).mockRejectedValueOnce(new AepbaseError(400, 'name is required', '/thingies'));

    await expect(run(client, KEYS.create, { name: '', recordId: newRecordId() })).rejects.toThrow(
      'name is required',
    );

    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual(seed);
    expect(outbox.requests()).toEqual([]);
  });
});

describe('writes to a record the server has not seen yet', () => {
  it('addresses an update to the new record’s name at once — no id to reconcile', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const recordId = newRecordId();

    await run(client, KEYS.create, { name: 'Bar', recordId });
    await run(client, KEYS.update, { id: recordId, data: { done: true } });

    expect(aepbase.update).toHaveBeenCalledWith('thingies', recordId, { done: true });
  });

  it('folds an offline update into the queued create: one request', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const recordId = newRecordId();
    onlineManager.setOnline(false);

    await run(client, KEYS.create, { name: 'Bar', recordId });
    await run(client, KEYS.update, { id: recordId, data: { done: true } });
    expect(outbox.requests()).toHaveLength(1);

    onlineManager.setOnline(true);
    await outbox.drain();
    expect(aepbase.create).toHaveBeenCalledTimes(1);
    expect(aepbase.create).toHaveBeenCalledWith(
      'thingies',
      expect.objectContaining({ name: 'Bar', done: true }),
      { id: recordId },
    );
    expect(aepbase.update).not.toHaveBeenCalled();
  });

  it('never sends a record created and deleted while offline', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const recordId = newRecordId();
    onlineManager.setOnline(false);

    await run(client, KEYS.create, { name: 'Baz', recordId });
    await run(client, KEYS.delete, recordId);

    onlineManager.setOnline(true);
    await outbox.drain();
    expect(aepbase.create).not.toHaveBeenCalled();
    expect(aepbase.remove).not.toHaveBeenCalled();
    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual([]);
  });

  it('deletes a record whose create is already on its way, after the create lands', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const recordId = newRecordId();
    let land!: () => void;
    vi.mocked(aepbase.create).mockImplementationOnce(
      () => new Promise((res) => (land = () => res({ id: recordId, name: 'Baz' }))),
    );

    const creating = run(client, KEYS.create, { name: 'Baz', recordId });
    await vi.waitFor(() => expect(aepbase.create).toHaveBeenCalled());
    const deleting = run(client, KEYS.delete, recordId);

    // The server already has the create; dropping it here would resurrect the
    // record on the next refetch. The delete must follow it.
    land();
    await creating;
    await deleting;
    expect(aepbase.remove).toHaveBeenCalledWith('thingies', recordId, { force: true });
  });
});

/**
 * A detail view reads `queryKeys.app(appId).resource(singular).detail(id)`;
 * the factory keeps that slot in step with the list itself, so an edit shows
 * on the record's own page — offline too, where nothing refetches.
 */
describe('detail cache slot', () => {
  it('primes the new record’s detail slot on create', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const recordId = newRecordId();

    await run(client, KEYS.create, { name: 'Foo', recordId });

    expect(client.getQueryData<Thingy>(DETAIL_KEY(recordId))).toMatchObject({ id: recordId, name: 'Foo' });
  });

  it('applies an update optimistically to the detail slot, then folds in the server copy', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), { id: 'srv-1', name: 'Foo' });
    let answer!: () => void;
    vi.mocked(aepbase.update).mockImplementationOnce(
      () => new Promise((res) => (answer = () => res({ id: 'srv-1', name: 'Renamed', done: true }))),
    );

    const updating = run(client, KEYS.update, { id: 'srv-1', data: { name: 'Renamed' } });
    await vi.waitFor(() => {
      expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))?.name).toBe('Renamed');
    });
    answer();
    await updating;

    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toMatchObject({ name: 'Renamed', done: true });
  });

  it('keeps the detail slot in step with the list while offline', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), { id: 'srv-1', name: 'Foo' });
    onlineManager.setOnline(false);

    // Offline the mutation settles at once: the write is saved on the device.
    await run(client, KEYS.update, { id: 'srv-1', data: { name: 'Renamed' } });

    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))?.name).toBe('Renamed');
    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0]?.name).toBe('Renamed');
    expect(aepbase.update).not.toHaveBeenCalled();

    onlineManager.setOnline(true);
    await outbox.drain();
    expect(aepbase.update).toHaveBeenCalledWith('thingies', 'srv-1', { name: 'Renamed' });
  });

  it('rolls the detail slot back when the server rejects an update', async () => {
    const client = makeClient();
    const original: Thingy = { id: 'srv-1', name: 'Foo' };
    client.setQueryData<Thingy[]>(LIST_KEY, [original]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), original);
    vi.mocked(aepbase.update).mockRejectedValueOnce(new AepbaseError(400, 'boom', '/thingies/srv-1'));

    await expect(run(client, KEYS.update, { id: 'srv-1', data: { name: 'Renamed' } })).rejects.toThrow();

    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toEqual(original);
  });

  it('drops the detail slot on delete and restores it when the server rejects', async () => {
    const client = makeClient();
    const original: Thingy = { id: 'srv-1', name: 'Foo' };
    client.setQueryData<Thingy[]>(LIST_KEY, [original]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), original);

    await run(client, KEYS.delete, 'srv-1');
    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toBeUndefined();

    client.setQueryData<Thingy[]>(LIST_KEY, [original]);
    client.setQueryData<Thingy>(DETAIL_KEY('srv-1'), original);
    vi.mocked(aepbase.remove).mockRejectedValueOnce(new AepbaseError(403, 'nope', '/thingies/srv-1'));

    await expect(run(client, KEYS.delete, 'srv-1')).rejects.toThrow();
    expect(client.getQueryData<Thingy>(DETAIL_KEY('srv-1'))).toEqual(original);
  });
});

describe('delete (AEP-135)', () => {
  it('treats a 404 as done instead of resurrecting the record', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    vi.mocked(aepbase.remove).mockRejectedValueOnce(new AepbaseError(404, 'not found', '/thingies/srv-1'));

    await run(client, KEYS.delete, 'srv-1');

    expect(client.getQueryData<Thingy[]>(LIST_KEY)).toEqual([]);
  });
});

/**
 * Store wifi with no internet: the browser says online, but every request
 * fails before reaching the server. The write must queue, not roll back.
 */
describe('network failures', () => {
  it('keeps a write that never reached the server, and sends it once back online', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo', done: false }]);
    vi.mocked(aepbase.update).mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));

    // The mutation settles: the change is saved on the device.
    await run(client, KEYS.update, { id: 'srv-1', data: { done: true } });
    expect(onlineManager.isOnline()).toBe(false);
    expect(outbox.isParked()).toBe(true);
    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0]?.done).toBe(true);

    onlineManager.setOnline(true);
    await outbox.drain();
    expect(aepbase.update).toHaveBeenCalledTimes(2);
    expect(outbox.requests()).toEqual([]);
  });

  it('still rolls back on an HTTP error, which is an answer rather than an outage', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo', done: false }]);
    vi.mocked(aepbase.update).mockRejectedValueOnce(new AepbaseError(400, 'bad', '/thingies/srv-1'));

    await expect(run(client, KEYS.update, { id: 'srv-1', data: { done: true } })).rejects.toThrow();

    expect(onlineManager.isOnline()).toBe(true);
    expect(aepbase.update).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0]?.done).toBe(false);
  });

  it('does not mistake a plain TypeError (a bug) for an outage', async () => {
    const client = makeClient();
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    vi.mocked(aepbase.update).mockRejectedValueOnce(new TypeError('x is undefined'));

    await expect(run(client, KEYS.update, { id: 'srv-1', data: { name: 'Bar' } })).rejects.toThrow(TypeError);
    expect(onlineManager.isOnline()).toBe(true);
  });
});

describe('syncCacheWithOutbox', () => {
  it('toasts a refusal of a write made offline, and refetches once the queue drains', async () => {
    const client = makeClient();
    const stop = syncCacheWithOutbox(client);
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    onlineManager.setOnline(false);
    await run(client, KEYS.update, { id: 'srv-1', data: { name: '' } });

    vi.mocked(aepbase.update).mockRejectedValueOnce(new AepbaseError(400, 'name is required', '/thingies/srv-1'));
    onlineManager.setOnline(true);
    await outbox.drain();

    expect(toast.error).toHaveBeenCalledWith('name is required');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.app('test-mod').all() });
    stop();
  });

  it('does not toast a refusal the mutation itself is reporting', async () => {
    const client = makeClient();
    const stop = syncCacheWithOutbox(client);
    client.setQueryData<Thingy[]>(LIST_KEY, [{ id: 'srv-1', name: 'Foo' }]);
    vi.mocked(aepbase.update).mockRejectedValueOnce(new AepbaseError(400, 'nope', '/thingies/srv-1'));

    await expect(run(client, KEYS.update, { id: 'srv-1', data: { name: '' } })).rejects.toThrow();

    expect(toast.error).not.toHaveBeenCalled();
    stop();
  });

  it('folds the record the server returns for an offline write into the cache', async () => {
    const client = makeClient();
    const stop = syncCacheWithOutbox(client);
    client.setQueryData<Thingy[]>(LIST_KEY, []);
    const recordId = newRecordId();
    onlineManager.setOnline(false);
    await run(client, KEYS.create, { name: 'Foo', recordId });

    vi.mocked(aepbase.create).mockResolvedValueOnce({ id: recordId, name: 'Foo', done: false });
    onlineManager.setOnline(true);
    await outbox.drain();

    expect(client.getQueryData<Thingy[]>(LIST_KEY)?.[0]).toMatchObject({ id: recordId, done: false });
    stop();
  });
});

describe('nested resources (AEP-122 names)', () => {
  const CC = 'credit-cards';
  const perkKeys = resourceMutationKeys(CC, 'perk');

  function makeNestedClient(): QueryClient {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    registerResourceMutationDefaults(client, { appId: CC, singular: 'credit-card', plural: 'credit-cards' });
    registerResourceMutationDefaults(client, { appId: CC, singular: 'perk', plural: 'perks', parents: ['credit-card'] });
    registerResourceMutationDefaults(client, {
      appId: CC,
      singular: 'redemption',
      plural: 'redemptions',
      parents: ['perk'],
    });
    return client;
  }

  it('creates a child under its parent’s name, keeping the parent field on the cached record only', async () => {
    const client = makeNestedClient();
    const perkList = queryKeys.app(CC).resource('perk').list();
    client.setQueryData(perkList, []);
    const recordId = newRecordId();

    await run(client, perkKeys.create, { credit_card: 'card-1', name: 'Dining', recordId });

    expect(aepbase.create).toHaveBeenCalledWith('perks', expect.objectContaining({ name: 'Dining' }), {
      parent: ['credit-cards', 'card-1'],
      id: recordId,
    });
    expect(vi.mocked(aepbase.create).mock.calls[0]![1]).not.toHaveProperty('credit_card');
    expect(client.getQueryData<Array<{ credit_card?: string }>>(perkList)?.[0]?.credit_card).toBe('card-1');
  });

  it('creates a grandchild under the parent record’s own name', async () => {
    const client = makeNestedClient();
    client.setQueryData(queryKeys.app(CC).resource('perk').list(), [
      { id: 'perk-1', path: 'credit-cards/card-1/perks/perk-1', credit_card: 'card-1', name: 'Dining' },
    ]);
    client.setQueryData(queryKeys.app(CC).resource('redemption').list(), []);

    await run(client, resourceMutationKeys(CC, 'redemption').create, {
      perk: 'perk-1',
      amount: 10,
      recordId: 'red1',
    });

    expect(aepbase.create).toHaveBeenCalledWith('redemptions', expect.objectContaining({ amount: 10 }), {
      parent: ['credit-cards', 'card-1', 'perks', 'perk-1'],
      id: 'red1',
    });
  });

  it('builds a name from parent fields when the cached record has no path', () => {
    const client = makeNestedClient();
    client.setQueryData(queryKeys.app(CC).resource('perk').list(), [
      { id: 'perk-1', credit_card: 'card-1', name: 'Dining' },
    ]);
    client.setQueryData(queryKeys.app(CC).resource('redemption').list(), [
      { id: 'red-1', perk: 'perk-1', amount: 10 },
    ]);
    expect(resourceNameFromCache(client, CC, 'redemption', 'red-1')).toBe(
      'credit-cards/card-1/perks/perk-1/redemptions/red-1',
    );
  });

  it('deletes a child by the name its record carries', async () => {
    const client = makeNestedClient();
    client.setQueryData(queryKeys.app(CC).resource('perk').list(), [
      { id: 'perk-1', path: 'credit-cards/card-1/perks/perk-1', credit_card: 'card-1', name: 'Dining' },
    ]);

    await run(client, perkKeys.delete, 'perk-1');

    expect(aepbase.remove).toHaveBeenCalledWith('perks', 'perk-1', {
      parent: ['credit-cards', 'card-1'],
      force: true,
    });
  });

  it('replays an earlier version’s { id, parent } delete', async () => {
    const client = makeNestedClient();
    await run(client, perkKeys.delete, { id: 'perk-1', parent: ['credit-cards', 'card-1'] });
    expect(aepbase.remove).toHaveBeenCalledWith('perks', 'perk-1', {
      parent: ['credit-cards', 'card-1'],
      force: true,
    });
  });

  it('refuses a child create whose parent it cannot place', async () => {
    const client = makeNestedClient();
    client.setQueryData(queryKeys.app(CC).resource('redemption').list(), []);
    await expect(
      run(client, resourceMutationKeys(CC, 'redemption').create, { perk: 'unknown', amount: 1, recordId: 'r1' }),
    ).rejects.toThrow(/perk isn't loaded/);
  });
});

describe('resources under the built-in user root', () => {
  const NOTES = 'notes-app';
  const noteKeys = resourceMutationKeys(NOTES, 'note');
  const noteList = queryKeys.app(NOTES).resource('note').list();

  function makeUserClient(): QueryClient {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    registerResourceMutationDefaults(client, { appId: NOTES, singular: 'note', plural: 'notes', parents: ['user'] });
    return client;
  }

  it('creates under the signed-in person’s own name', async () => {
    const client = makeUserClient();
    client.setQueryData(noteList, []);

    await run(client, noteKeys.create, { body: 'Milk', recordId: 'n1' });

    expect(aepbase.create).toHaveBeenCalledWith('notes', expect.objectContaining({ body: 'Milk' }), {
      parent: ['users', 'test-user-id'],
      id: 'n1',
    });
    expect(client.getQueryData<Array<{ path?: string }>>(noteList)?.[0]?.path).toBe(
      'users/test-user-id/notes/n1',
    );
  });

  it('names a cached record without a path under its owner', () => {
    const client = makeUserClient();
    client.setQueryData(noteList, [
      { id: 'n1', body: 'Mine' },
      { id: 'n2', user: 'someone-else', body: 'Theirs' },
    ]);
    expect(resourceNameFromCache(client, NOTES, 'note', 'n1')).toBe('users/test-user-id/notes/n1');
    expect(resourceNameFromCache(client, NOTES, 'note', 'n2')).toBe('users/someone-else/notes/n2');
  });

  it('updates and deletes by the record’s name', async () => {
    const client = makeUserClient();
    client.setQueryData(noteList, [{ id: 'n1', path: 'users/test-user-id/notes/n1', body: 'Milk' }]);
    vi.mocked(aepbase.update).mockImplementationOnce(async (plural, id, body) => ({
      id,
      path: `users/test-user-id/${plural}/${id}`,
      ...(body as object),
    }));

    await run(client, noteKeys.update, { id: 'n1', data: { struck: true } });
    expect(aepbase.update).toHaveBeenCalledWith(
      'notes',
      'n1',
      { struck: true },
      expect.objectContaining({ parent: ['users', 'test-user-id'] }),
    );

    await run(client, noteKeys.delete, 'n1');
    expect(aepbase.remove).toHaveBeenCalledWith('notes', 'n1', {
      parent: ['users', 'test-user-id'],
      force: true,
    });
  });
});

describe('reads that include queued writes', () => {
  it('a list fetched while writes are queued still shows them', () => {
    makeClient();
    onlineManager.setOnline(false);
    outbox.enqueue('create', 'thingies/new1', { name: 'New' });
    outbox.enqueue('update', 'thingies/srv-1', { done: true });

    const fetched = withPendingWrites<Thingy>('test-mod', 'thingy', [{ id: 'srv-1', name: 'Foo', done: false }]);

    expect(fetched).toEqual([
      { id: 'srv-1', name: 'Foo', done: true },
      expect.objectContaining({ id: 'new1', name: 'New', path: 'thingies/new1' }),
    ]);
  });

  it('lays queued writes over a restored cache, parent field included', () => {
    const client = new QueryClient();
    registerResourceMutationDefaults(client, { appId: 'cc', singular: 'credit-card', plural: 'credit-cards' });
    registerResourceMutationDefaults(client, { appId: 'cc', singular: 'perk', plural: 'perks', parents: ['credit-card'] });
    const perks = queryKeys.app('cc').resource('perk').list();
    client.setQueryData(perks, []);
    onlineManager.setOnline(false);
    outbox.enqueue('create', 'credit-cards/c1/perks/p9', { name: 'Lounge' });

    overlayPendingWrites(client);

    expect(client.getQueryData(perks)).toEqual([
      expect.objectContaining({ id: 'p9', name: 'Lounge', credit_card: 'c1', path: 'credit-cards/c1/perks/p9' }),
    ]);
  });
});
