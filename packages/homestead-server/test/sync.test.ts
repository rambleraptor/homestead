import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Database } from '../src/engine/sqlite';
import { createUserTables, getUserByToken } from '../src/engine/users';
import { createSuperuser } from '../src/bootstrap';
import {
  createSyncDispatcher,
  runResourceSync,
  syncOperationMethod,
  type SyncDispatchInput,
} from '../src/sync';
import type { RegisteredResourceSync } from '@rambleraptor/homestead-core/apps/registry';
import type { SyncContext, SyncHandler } from '@rambleraptor/homestead-core/apps/types';
import type {
  CompleteOperationInput,
  CreateOperationInput,
  Operation,
  OperationStore,
  UpdateMetadataInput,
} from '@rambleraptor/homestead-core/resources/operations';

async function freshDb(withSuperuser = true): Promise<Database> {
  const db = new Database(':memory:');
  createUserTables(db);
  if (withSuperuser) await createSuperuser(db, 'owner@example.com', 'pw');
  return db;
}

/** Build a sync around a handler, defaulting the boilerplate fields. */
function sync(
  id: string,
  handler: SyncHandler,
  extra: Partial<RegisteredResourceSync> = {},
): RegisteredResourceSync {
  return {
    id,
    appId: 'test-app',
    resource: 'user',
    load: async () => ({ default: handler }),
    ...extra,
  };
}

/** A dispatch input, defaulting to a simple create. */
function input(extra: Partial<SyncDispatchInput> = {}): SyncDispatchInput {
  return {
    event: 'create',
    resource: 'user',
    recordId: 'rec-1',
    record: { id: 'rec-1' },
    previous: null,
    ...extra,
  };
}

/** A fake OperationStore recording every call, mirroring the cron test. */
function fakeOperationStore(overrides: Partial<OperationStore> = {}) {
  const created: CreateOperationInput[] = [];
  const completed: CompleteOperationInput[] = [];
  const updated: UpdateMetadataInput[] = [];
  let seq = 0;
  const store: OperationStore = {
    async create(input) {
      created.push(input);
      const op = { id: `op-${++seq}`, path: `operations/op-${seq}`, done: false } as Operation;
      return op;
    },
    async complete(input) {
      completed.push(input);
    },
    async updateMetadata(input) {
      updated.push(input);
    },
    ...overrides,
  };
  return { store, created, completed, updated };
}

function loggedMessages(updated: UpdateMetadataInput[]): string[] {
  const last = updated.at(-1);
  if (!last) return [];
  return (last.metadata.logs as { message: string }[]).map((e) => e.message);
}

function loggedLine(spy: ReturnType<typeof vi.spyOn>, ...parts: string[]): boolean {
  return spy.mock.calls.some((call: unknown[]) => parts.every((p) => String(call[0]).includes(p)));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timed out');
    await sleep(5);
  }
}

beforeEach(() => {
  // Retry immediately so the retry test doesn't sleep on the real backoff.
  process.env.HOMESTEAD_SYNC_RETRY_BACKOFF_MS = '0,0';
});

afterEach(() => {
  delete process.env.HOMESTEAD_SYNC_RETRY_BACKOFF_MS;
  vi.restoreAllMocks();
});

describe('runResourceSync', () => {
  test('hands the handler a working admin token + full context, then revokes it', async () => {
    const db = await freshDb();
    const { store } = fakeOperationStore();
    let seen: SyncContext | undefined;
    let userDuringRun: string | undefined;

    await runResourceSync(
      db,
      sync('mirror', async (ctx) => {
        seen = ctx;
        userDuringRun = getUserByToken(db, ctx.token)?.email;
      }),
      input({ event: 'update', recordId: 'u1', record: { id: 'u1', email: 'a@b.c' }, previous: { id: 'u1' } }),
      store,
    );

    expect(seen?.id).toBe('mirror');
    expect(seen?.appId).toBe('test-app');
    expect(seen?.resource).toBe('user');
    expect(seen?.event).toBe('update');
    expect(seen?.recordId).toBe('u1');
    expect(seen?.record).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(seen?.previous).toEqual({ id: 'u1' });
    expect(seen?.firedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(userDuringRun).toBe('owner@example.com');
    // Token revoked once the handler settled.
    expect(getUserByToken(db, seen!.token)).toBeNull();
    db.close();
  });

  test('opens an operation and completes it with the handler result on success', async () => {
    const db = await freshDb();
    const { store, created, completed, updated } = fakeOperationStore();

    await runResourceSync(
      db,
      sync('mirror', async () => ({ mirrored: 'rec-1' }), { title: 'Mirror user to Maps' }),
      input(),
      store,
    );

    expect(created).toHaveLength(1);
    expect(created[0].method).toBe(syncOperationMethod('mirror'));
    expect(created[0].method).toBe('sync:mirror');
    expect(created[0].title).toBe('Mirror user to Maps');
    expect(created[0].createdBy).toBeTruthy();
    expect(completed).toEqual([
      { token: expect.any(String), id: 'op-1', response: { mirrored: 'rec-1' } },
    ]);
    expect(loggedMessages(updated)).toEqual(['started', 'succeeded']);
    db.close();
  });

  test('defaults the operation title to the sync id and response to {}', async () => {
    const db = await freshDb();
    const { store, created, completed } = fakeOperationStore();
    await runResourceSync(db, sync('bare', async () => {}), input(), store);
    expect(created[0].title).toBe('bare');
    expect(completed[0].response).toEqual({});
    db.close();
  });

  test('retries a throwing handler up to 3 attempts, logging each retry', async () => {
    const db = await freshDb();
    const { store, completed, updated } = fakeOperationStore();
    let attempts = 0;

    await runResourceSync(
      db,
      sync('flaky', async () => {
        attempts++;
        if (attempts < 3) throw new Error(`boom ${attempts}`);
        return { ok: true };
      }),
      input(),
      store,
    );

    expect(attempts).toBe(3);
    // Succeeded on the 3rd attempt; the response is recorded.
    expect(completed[0].response).toEqual({ ok: true });
    expect(loggedMessages(updated)).toEqual([
      'started',
      'retry 2/3 after error: boom 1',
      'retry 3/3 after error: boom 2',
      'succeeded',
    ]);
    db.close();
  });

  test('records the final error when every attempt fails', async () => {
    const db = await freshDb();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, completed, updated } = fakeOperationStore();

    await expect(
      runResourceSync(
        db,
        sync('doomed', async () => {
          throw new Error('always');
        }),
        input(),
        store,
      ),
    ).resolves.toBeUndefined();

    expect(loggedLine(err, '[sync] failed', 'sync=doomed')).toBe(true);
    expect(completed[0].error).toBeInstanceOf(Error);
    expect(loggedMessages(updated)).toEqual([
      'started',
      'retry 2/3 after error: always',
      'retry 3/3 after error: always',
      'failed: always',
    ]);
    db.close();
  });

  test('revokes the token even when the handler ultimately fails', async () => {
    const db = await freshDb();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = fakeOperationStore();
    let token: string | undefined;
    await runResourceSync(
      db,
      sync('flaky', async (ctx) => {
        token = ctx.token;
        throw new Error('boom');
      }),
      input(),
      store,
    );
    expect(getUserByToken(db, token!)).toBeNull();
    db.close();
  });

  test('logs and skips when no admin exists, without touching operations', async () => {
    const db = await freshDb(false);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, created } = fakeOperationStore();
    let called = false;
    await runResourceSync(
      db,
      sync('orphan', async () => {
        called = true;
      }),
      input(),
      store,
    );
    expect(called).toBe(false);
    expect(created).toHaveLength(0);
    expect(loggedLine(err, '[sync] no admin available; skipping', 'sync=orphan')).toBe(true);
    db.close();
  });
});

describe('createSyncDispatcher', () => {
  test('dispatch fires only matching resource + event, and never throws', async () => {
    const db = await freshDb();
    const { store, created } = fakeOperationStore();
    const dispatcher = createSyncDispatcher(
      db,
      [
        sync('on-user-create', async () => {}, { resource: 'user', on: ['create'] }),
        sync('on-address', async () => {}, { resource: 'address' }),
      ],
      store,
    );

    // Matches the create-only user sync; the address sync is untouched.
    expect(() => dispatcher.dispatch(input({ event: 'create', resource: 'user' }))).not.toThrow();
    // Wrong event for the create-only sync — no firing.
    dispatcher.dispatch(input({ event: 'update', resource: 'user' }));
    // Unknown resource — no firing.
    dispatcher.dispatch(input({ event: 'create', resource: 'nope' }));

    await waitUntil(() => created.length >= 1);
    await sleep(30);
    expect(created).toHaveLength(1);
    expect(created[0].method).toBe('sync:on-user-create');
    db.close();
  });

  test("skips a change its when check rejects, starting no operation; a throwing check fires", async () => {
    const db = await freshDb();
    const { store, created } = fakeOperationStore();
    const dispatcher = createSyncDispatcher(
      db,
      [
        sync('picky', async () => {}, { when: ({ record }) => record?.wanted === true }),
        sync('broken', async () => {}, {
          when: () => {
            throw new Error('bug');
          },
        }),
      ],
      store,
    );

    dispatcher.dispatch(input({ record: { id: 'r', wanted: false } }));
    dispatcher.dispatch(input({ recordId: 'r2', record: { id: 'r2', wanted: true } }));

    await waitUntil(() => created.length >= 3);
    await sleep(30);
    expect(created.map((o) => o.method).sort()).toEqual(['sync:broken', 'sync:broken', 'sync:picky']);
    db.close();
  });

  test('serializes runs for the same record; different records run concurrently', async () => {
    const db = await freshDb();
    const { store } = fakeOperationStore();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => (releaseFirst = r));
    let seen = 0;

    const handler: SyncHandler = async (ctx) => {
      const tag = `${ctx.recordId}:${ctx.record?.n}`;
      order.push(`start ${tag}`);
      seen++;
      // The very first run for rec-1 blocks until released, so a second dispatch
      // for rec-1 must queue behind it while rec-2 proceeds.
      if (tag === 'rec-1:1') await firstGate;
      order.push(`end ${tag}`);
    };

    const dispatcher = createSyncDispatcher(db, [sync('s', handler, { resource: 'user' })], store);

    dispatcher.dispatch(input({ recordId: 'rec-1', record: { id: 'rec-1', n: 1 } }));
    dispatcher.dispatch(input({ recordId: 'rec-1', record: { id: 'rec-1', n: 2 } }));
    dispatcher.dispatch(input({ recordId: 'rec-2', record: { id: 'rec-2', n: 1 } }));

    // rec-2 can finish while rec-1's first run is still gated; rec-1's second
    // run has NOT started yet (serialized behind the first).
    await waitUntil(() => order.includes('end rec-2:1'));
    expect(order).toContain('start rec-1:1');
    expect(order).not.toContain('start rec-1:2');

    releaseFirst();
    await waitUntil(() => seen === 3 && order.includes('end rec-1:2'));

    // For rec-1, run n=1 fully precedes run n=2 (ordered mirroring).
    expect(order.indexOf('end rec-1:1')).toBeLessThan(order.indexOf('start rec-1:2'));
    db.close();
  });
});
