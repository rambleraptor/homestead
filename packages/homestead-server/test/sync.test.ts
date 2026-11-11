import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Database } from '../src/engine/sqlite';
import { __resetMasterKeyCacheForTests } from '../src/engine/crypto';
import { runWithRequestContext } from '../src/engine/request-context';
import { OUTBOX_TABLE } from '../src/sync-outbox';
import type { User } from '../src/engine/types';
import { createUserTables, getUserByToken } from '../src/engine/users';
import { createSuperuser } from '../src/bootstrap';
import {
  createSyncDispatcher,
  runResourceSync,
  syncOperationMethod,
  type DurableSyncDispatcher,
  type SyncDelivery,
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

/** One delivery for `runResourceSync`, defaulting to a first-delivery create. */
function delivery(extra: Partial<SyncDelivery> = {}): SyncDelivery {
  return {
    event: 'create',
    resource: 'user',
    recordId: 'rec-1',
    record: { id: 'rec-1' },
    previous: null,
    actor: null,
    origin: null,
    delivery: 1,
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

const dispatchers: DurableSyncDispatcher[] = [];

afterEach(() => {
  for (const d of dispatchers.splice(0)) d.stop();
  delete process.env.HOMESTEAD_SYNC_RETRY_BACKOFF_MS;
  delete process.env.HOMESTEAD_SYNC_REDELIVERY_MS;
  vi.restoreAllMocks();
});

/** `createSyncDispatcher`, stopped again after the test. */
function dispatcherFor(...args: Parameters<typeof createSyncDispatcher>): DurableSyncDispatcher {
  const d = createSyncDispatcher(...args);
  dispatchers.push(d);
  return d;
}

interface OutboxRow {
  seq: number;
  sync_id: string;
  record_id: string;
  state: string;
  deliveries: number;
  last_error: string | null;
  payload: string;
}

function outboxRows(db: Database): OutboxRow[] {
  return db.query(`SELECT * FROM ${OUTBOX_TABLE} ORDER BY seq`).all() as OutboxRow[];
}

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
      delivery({
        event: 'update',
        recordId: 'u1',
        record: { id: 'u1', email: 'a@b.c' },
        previous: { id: 'u1' },
        actor: 'users/u9',
        origin: 'tab-1',
        delivery: 2,
      }),
      store,
    );

    expect(seen?.id).toBe('mirror');
    expect(seen?.appId).toBe('test-app');
    expect(seen?.resource).toBe('user');
    expect(seen?.event).toBe('update');
    expect(seen?.recordId).toBe('u1');
    expect(seen?.record).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(seen?.previous).toEqual({ id: 'u1' });
    expect(seen?.actor).toBe('users/u9');
    expect(seen?.origin).toBe('tab-1');
    expect(seen?.writeOrigin).toBe('sync:mirror');
    expect(seen?.delivery).toBe(2);
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
      delivery(),
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
    await runResourceSync(db, sync('bare', async () => {}), delivery(), store);
    expect(created[0].title).toBe('bare');
    expect(completed[0].response).toEqual({});
    db.close();
  });

  test('retries a throwing handler up to 3 attempts, logging each retry', async () => {
    const db = await freshDb();
    const { store, completed, updated } = fakeOperationStore();
    let attempts = 0;

    const result = await runResourceSync(
      db,
      sync('flaky', async () => {
        attempts++;
        if (attempts < 3) throw new Error(`boom ${attempts}`);
        return { ok: true };
      }),
      delivery(),
      store,
    );

    expect(attempts).toBe(3);
    expect(result).toEqual({ ok: true });
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
        delivery(),
        store,
      ),
    ).resolves.toEqual({ ok: false, error: 'always' });

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
      delivery(),
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
    const result = await runResourceSync(
      db,
      sync('orphan', async () => {
        called = true;
      }),
      delivery(),
      store,
    );
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
    expect(loggedLine(err, '[sync] no admin available; skipping', 'sync=orphan')).toBe(true);
    db.close();
  });
});

describe('createSyncDispatcher', () => {
  test('dispatch fires only matching resource + event, and never throws', async () => {
    const db = await freshDb();
    const { store, created } = fakeOperationStore();
    const dispatcher = dispatcherFor(
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
    await dispatcher.idle();
    dispatcher.stop();
    db.close();
  });

  test("skips a change its when check rejects, starting no operation; a throwing check fires", async () => {
    const db = await freshDb();
    const { store, created } = fakeOperationStore();
    const dispatcher = dispatcherFor(
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
    await dispatcher.idle();
    dispatcher.stop();
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

    const dispatcher = dispatcherFor(db, [sync('s', handler, { resource: 'user' })], store);

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
    await dispatcher.idle();
    dispatcher.stop();
    db.close();
  });

  test('hands the handler and the when check the writer and origin from the request', async () => {
    const db = await freshDb();
    const { store } = fakeOperationStore();
    const seen: SyncContext[] = [];
    const checked: Array<{ actor: string | null; origin: string | null }> = [];
    const dispatcher = dispatcherFor(
      db,
      [
        sync('mirror', async (ctx) => void seen.push(ctx), {
          when: ({ actor, origin }) => {
            checked.push({ actor, origin });
            return true;
          },
        }),
      ],
      store,
    );

    const caller = { id: 'u7' } as User;
    runWithRequestContext({ caller, origin: 'tab-42' }, () => dispatcher.dispatch(input()));
    // Outside any request: no writer.
    dispatcher.dispatch(input({ recordId: 'rec-2' }));

    await waitUntil(() => seen.length === 2);
    await dispatcher.idle();
    expect(checked).toEqual([
      { actor: 'users/u7', origin: 'tab-42' },
      { actor: null, origin: null },
    ]);
    const byRecord = Object.fromEntries(seen.map((c) => [c.recordId, c]));
    expect(byRecord['rec-1']).toMatchObject({ actor: 'users/u7', origin: 'tab-42', delivery: 1 });
    expect(byRecord['rec-2']).toMatchObject({ actor: null, origin: null });
    dispatcher.stop();
    db.close();
  });

  test("never fires a sync on a change carrying its own write origin", async () => {
    const db = await freshDb();
    const { store, created } = fakeOperationStore();
    const dispatcher = dispatcherFor(
      db,
      [sync('gcal-push', async () => {}), sync('other', async () => {})],
      store,
    );

    dispatcher.dispatch(input({ origin: 'sync:gcal-push' }));

    await waitUntil(() => created.length >= 1);
    await dispatcher.idle();
    // Only the other sync saw it; nothing for gcal-push was even queued.
    expect(created.map((o) => o.method)).toEqual(['sync:other']);
    expect(outboxRows(db)).toEqual([]);
    dispatcher.stop();
    db.close();
  });

  test('keeps the change in the outbox until delivered, then forgets it', async () => {
    const db = await freshDb();
    const { store } = fakeOperationStore();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started = false;
    const dispatcher = dispatcherFor(
      db,
      [
        sync('slow', async () => {
          started = true;
          await gate;
        }),
      ],
      store,
    );

    dispatcher.dispatch(input());
    // Durable before the handler has done anything.
    expect(outboxRows(db)).toMatchObject([{ sync_id: 'slow', record_id: 'rec-1', state: 'pending' }]);

    await waitUntil(() => started);
    release();
    await dispatcher.idle();
    expect(outboxRows(db)).toEqual([]);
    dispatcher.stop();
    db.close();
  });

  test('redelivers a failed change later, counting deliveries', async () => {
    process.env.HOMESTEAD_SYNC_REDELIVERY_MS = '0,0,0';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await freshDb();
    const { store, updated } = fakeOperationStore();
    const deliveries: number[] = [];
    const dispatcher = dispatcherFor(
      db,
      [
        sync('flaky', async (ctx) => {
          deliveries.push(ctx.delivery);
          if (ctx.delivery < 3) throw new Error(`down ${ctx.delivery}`);
          return { ok: true };
        }),
      ],
      store,
    );

    dispatcher.dispatch(input());
    await waitUntil(() => deliveries.includes(3));
    await dispatcher.idle();

    // Three quick attempts in each of the two failed deliveries, then success.
    expect(deliveries).toEqual([1, 1, 1, 2, 2, 2, 3]);
    expect(outboxRows(db)).toEqual([]);
    expect(
      updated.some((u) =>
        (u.metadata.logs as { message: string }[]).some((l) => l.message === 'delivery 3 of 4'),
      ),
    ).toBe(true);
    dispatcher.stop();
    db.close();
  });

  test('parks a change as dead after its last delivery; later changes still go out', async () => {
    process.env.HOMESTEAD_SYNC_REDELIVERY_MS = '0';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await freshDb();
    const { store } = fakeOperationStore();
    const delivered: unknown[] = [];
    const dispatcher = dispatcherFor(
      db,
      [
        sync('picky', async (ctx) => {
          if (ctx.record?.n === 1) throw new Error('rejected');
          delivered.push(ctx.record?.n);
        }),
      ],
      store,
    );

    dispatcher.dispatch(input({ record: { id: 'rec-1', n: 1 } }));
    dispatcher.dispatch(input({ event: 'update', record: { id: 'rec-1', n: 2 } }));
    await waitUntil(() => delivered.length === 1);
    await dispatcher.idle();

    expect(delivered).toEqual([2]);
    expect(outboxRows(db)).toMatchObject([
      { record_id: 'rec-1', state: 'dead', deliveries: 2, last_error: 'rejected' },
    ]);
    expect(loggedLine(err, 'giving up on change', 'sync=picky')).toBe(true);
    dispatcher.stop();
    db.close();
  });

  test('holds later changes to a record behind one waiting to be redelivered', async () => {
    process.env.HOMESTEAD_SYNC_REDELIVERY_MS = '60000';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await freshDb();
    const { store } = fakeOperationStore();
    let clock = 1_000_000;
    let failing = true;
    const delivered: string[] = [];
    const dispatcher = dispatcherFor(
      db,
      [
        sync('ordered', async (ctx) => {
          if (failing) throw new Error('offline');
          delivered.push(`${ctx.recordId}:${ctx.record?.n}`);
        }),
      ],
      store,
      { now: () => clock },
    );

    dispatcher.dispatch(input({ record: { id: 'rec-1', n: 1 } }));
    await waitUntil(() => outboxRows(db)[0]?.deliveries === 1);
    failing = false;
    dispatcher.dispatch(input({ event: 'update', record: { id: 'rec-1', n: 2 } }));
    dispatcher.dispatch(input({ recordId: 'rec-2', record: { id: 'rec-2', n: 1 } }));
    await waitUntil(() => delivered.length === 1);
    await dispatcher.idle();

    // rec-2 went out; rec-1's second change waits behind its first.
    expect(delivered).toEqual(['rec-2:1']);
    expect(outboxRows(db).map((r) => r.record_id)).toEqual(['rec-1', 'rec-1']);

    // A minute later the first change is due again, and both go out in order.
    clock += 60_000;
    // Any new change wakes the drainer, as its timer would have.
    dispatcher.dispatch(input({ recordId: 'rec-3', record: { id: 'rec-3', n: 1 } }));
    await waitUntil(() => delivered.length === 4);
    await dispatcher.idle();
    expect(delivered.filter((d) => d.startsWith('rec-1'))).toEqual(['rec-1:1', 'rec-1:2']);
    expect(outboxRows(db)).toEqual([]);
    dispatcher.stop();
    db.close();
  });

  test('a restarted server delivers what the previous one left pending', async () => {
    process.env.HOMESTEAD_SYNC_REDELIVERY_MS = '60000';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await freshDb();
    const { store } = fakeOperationStore();

    const first = dispatcherFor(
      db,
      [
        sync('mirror', async () => {
          throw new Error('offline');
        }),
      ],
      store,
    );
    runWithRequestContext({ caller: { id: 'u1' } as User, origin: 'tab-1' }, () =>
      first.dispatch(input({ record: { id: 'rec-1', title: 'Soccer' } })),
    );
    await waitUntil(() => outboxRows(db)[0]?.deliveries === 1);
    first.stop();

    const seen: SyncContext[] = [];
    // The redelivery is due a minute after the failure.
    const second = dispatcherFor(db, [sync('mirror', async (ctx) => void seen.push(ctx))], store, {
      now: () => Date.now() + 120_000,
    });
    await waitUntil(() => seen.length === 1);
    await second.idle();

    expect(seen[0]).toMatchObject({
      recordId: 'rec-1',
      record: { id: 'rec-1', title: 'Soccer' },
      actor: 'users/u1',
      origin: 'tab-1',
      delivery: 2,
    });
    expect(outboxRows(db)).toEqual([]);
    second.stop();
    db.close();
  });

  test('parks a change whose sync is no longer installed', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await freshDb();
    const { store } = fakeOperationStore();
    const first = dispatcherFor(db, [sync('gone', async () => new Promise(() => {}))], store);
    first.dispatch(input());
    first.stop();

    const second = dispatcherFor(db, [], store);
    await waitUntil(() => outboxRows(db)[0]?.state === 'dead');
    await second.idle();
    expect(outboxRows(db)[0].last_error).toBe('no sync "gone" is installed');
    expect(loggedLine(err, 'giving up on change', 'sync=gone')).toBe(true);
    second.stop();
    db.close();
  });

  test('encrypts queued snapshots when a master key is configured', async () => {
    process.env.HOMESTEAD_MASTER_KEY = randomBytes(32).toString('base64');
    __resetMasterKeyCacheForTests();
    try {
      const db = await freshDb();
      const { store } = fakeOperationStore();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const seen: SyncContext[] = [];
      const dispatcher = dispatcherFor(
        db,
        [
          sync('mirror', async (ctx) => {
            seen.push(ctx);
            await gate;
          }),
        ],
        store,
      );

      dispatcher.dispatch(input({ record: { id: 'rec-1', pin: '4321' } }));
      const [row] = outboxRows(db);
      expect(row.payload.startsWith('enc:v1:')).toBe(true);
      expect(row.payload).not.toContain('4321');

      await waitUntil(() => seen.length === 1);
      expect(seen[0].record).toEqual({ id: 'rec-1', pin: '4321' });
      release();
      await dispatcher.idle();
      dispatcher.stop();
      db.close();
    } finally {
      delete process.env.HOMESTEAD_MASTER_KEY;
      __resetMasterKeyCacheForTests();
    }
  });
});
