import { afterEach, describe, expect, test, vi } from 'vitest';
import { Database } from '../src/engine/sqlite';
import { createUserTables, getUserByToken } from '../src/engine/users';
import { createSuperuser } from '../src/bootstrap';
import {
  cronOperationMethod,
  nextDailyFire,
  runCronHook,
  startCronScheduler,
} from '../src/cron';
import type { RegisteredCronHook } from '@rambleraptor/homestead-core/apps/registry';
import type { CronContext, CronHandler } from '@rambleraptor/homestead-core/apps/types';
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

/** Build a hook around a handler, defaulting the boilerplate fields. */
function hook(
  id: string,
  handler: CronHandler,
  extra: Partial<RegisteredCronHook> = {},
): RegisteredCronHook {
  return {
    id,
    appId: 'test-app',
    intervalSeconds: 10,
    load: async () => ({ default: handler }),
    ...extra,
  };
}

/**
 * A fake OperationStore that records every create/complete call, so tests can
 * assert the operation lifecycle without a running engine.
 */
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

/** The message timeline persisted across a store's updateMetadata writes. */
function loggedMessages(updated: UpdateMetadataInput[]): string[] {
  const last = updated.at(-1);
  if (!last) return [];
  return (last.metadata.logs as { message: string }[]).map((e) => e.message);
}

/**
 * True when a `console.log/warn/error` spy received a single-string log line
 * (the logger's text format) containing every given substring. Kept substring-
 * based so log formatting can evolve without breaking these assertions.
 */
function loggedLine(spy: ReturnType<typeof vi.spyOn>, ...parts: string[]): boolean {
  return spy.mock.calls.some(
    (call: unknown[]) => parts.every((p) => String(call[0]).includes(p)),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll `predicate` until true or the deadline elapses. */
async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timed out');
    await sleep(5);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runCronHook', () => {
  test('hands the handler a working admin token + context, then revokes it', async () => {
    const db = await freshDb();
    const { store } = fakeOperationStore();
    let seen: CronContext | undefined;
    let userDuringRun: string | undefined;

    await runCronHook(
      db,
      hook('digest', async (ctx) => {
        seen = ctx;
        userDuringRun = getUserByToken(db, ctx.token)?.email;
      }),
      store,
    );

    expect(seen?.id).toBe('digest');
    expect(seen?.appId).toBe('test-app');
    expect(seen?.writeOrigin).toBe('cron:digest');
    expect(seen?.firedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The token resolved to the superuser while the handler ran…
    expect(userDuringRun).toBe('owner@example.com');
    // …and was revoked once the handler settled.
    expect(getUserByToken(db, seen!.token)).toBeNull();

    db.close();
  });

  test('opens an operation and completes it with the handler result on success', async () => {
    const db = await freshDb();
    const { store, created, completed, updated } = fakeOperationStore();

    await runCronHook(
      db,
      hook('digest', async () => ({ processed: 3 }), { title: 'Nightly digest' }),
      store,
    );

    expect(created).toHaveLength(1);
    expect(created[0].method).toBe(cronOperationMethod('digest'));
    expect(created[0].method).toBe('cron:digest');
    expect(created[0].title).toBe('Nightly digest');
    // created_by is the minted admin's user id (the superuser).
    expect(created[0].createdBy).toBeTruthy();

    expect(completed).toEqual([
      { token: expect.any(String), id: 'op-1', response: { processed: 3 } },
    ]);
    // The firing is bracketed with started/succeeded log entries.
    expect(loggedMessages(updated)).toEqual(['started', 'succeeded']);
    db.close();
  });

  test('records the handler ctx.log entries between started and succeeded', async () => {
    const db = await freshDb();
    const { store, updated } = fakeOperationStore();

    await runCronHook(
      db,
      hook('digest', async (ctx) => {
        await ctx.log('fetching');
        await ctx.log('processed 5 of 5');
      }),
      store,
    );

    expect(loggedMessages(updated)).toEqual([
      'started',
      'fetching',
      'processed 5 of 5',
      'succeeded',
    ]);
    db.close();
  });

  test('defaults the operation title to the hook id and response to {}', async () => {
    const db = await freshDb();
    const { store, created, completed } = fakeOperationStore();

    await runCronHook(db, hook('bare', async () => {}), store);

    expect(created[0].title).toBe('bare');
    expect(completed[0].response).toEqual({});
    db.close();
  });

  test('completes the operation with the error when the handler throws', async () => {
    const db = await freshDb();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, completed, updated } = fakeOperationStore();

    await expect(
      runCronHook(
        db,
        hook('flaky', async () => {
          throw new Error('boom');
        }),
        store,
      ),
    ).resolves.toBeUndefined();

    expect(loggedLine(err, '[cron] failed', 'hook=flaky')).toBe(true);
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe('op-1');
    expect(completed[0].error).toBeInstanceOf(Error);
    expect(completed[0].response).toBeUndefined();
    // The terminal log entry carries the failure message.
    expect(loggedMessages(updated)).toEqual(['started', 'failed: boom']);
    db.close();
  });

  test('still runs the handler when the operation cannot be created', async () => {
    const db = await freshDb();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, completed, updated } = fakeOperationStore({
      create: async () => {
        throw new Error('operations table not ready');
      },
    });
    let ran = false;

    await runCronHook(
      db,
      hook('early', async (ctx) => {
        ran = true;
        // ctx.log is a safe no-op when there's no operation to log against.
        await ctx.log('should be swallowed');
      }),
      store,
    );

    expect(ran).toBe(true);
    // No operation to complete or log against when create failed.
    expect(completed).toHaveLength(0);
    expect(updated).toHaveLength(0);
    expect(
      loggedLine(err, '[cron] could not open an operation; running without one', 'hook=early'),
    ).toBe(true);
    db.close();
  });

  test('revokes the token even when the handler throws', async () => {
    const db = await freshDb();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = fakeOperationStore();
    let token: string | undefined;

    await runCronHook(
      db,
      hook('flaky', async (ctx) => {
        token = ctx.token;
        throw new Error('boom');
      }),
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

    await runCronHook(
      db,
      hook('orphan', async () => {
        called = true;
      }),
      store,
    );

    expect(called).toBe(false);
    expect(created).toHaveLength(0);
    expect(loggedLine(err, '[cron] no admin available; skipping', 'hook=orphan')).toBe(true);
    db.close();
  });
});

describe('startCronScheduler', () => {
  test('runOnStart fires the handler once at boot', async () => {
    const db = await freshDb();
    const { store, completed } = fakeOperationStore();
    let calls = 0;
    const scheduler = startCronScheduler(
      db,
      // A long interval so only the runOnStart firing lands during the test.
      [hook('boot', async () => void calls++, { runOnStart: true, intervalSeconds: 60 })],
      store,
    );

    await waitUntil(() => calls === 1);
    expect(calls).toBe(1);
    // The boot firing was logged as an operation.
    await waitUntil(() => completed.length === 1);

    scheduler.stop();
    db.close();
  });

  test('fires repeatedly on the interval and stop() halts further firings', async () => {
    const db = await freshDb();
    const { store } = fakeOperationStore();
    let calls = 0;
    // 30ms interval keeps the test quick while staying comfortably above timer jitter.
    const scheduler = startCronScheduler(
      db,
      [hook('tick', async () => void calls++, { intervalSeconds: 0.03 })],
      store,
    );

    await waitUntil(() => calls >= 2);
    scheduler.stop();

    const afterStop = calls;
    await sleep(120);
    expect(calls).toBe(afterStop);

    db.close();
  });

  test('skips a tick while the previous run of the same hook is still in flight', async () => {
    const db = await freshDb();
    const { store } = fakeOperationStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let starts = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const scheduler = startCronScheduler(
      db,
      [
        hook(
          'slow',
          async () => {
            starts++;
            await gate;
          },
          { intervalSeconds: 0.03 },
        ),
      ],
      store,
    );

    // First tick starts the handler, which blocks on the gate; later ticks
    // arrive while it's still running and must be skipped.
    await waitUntil(() => warn.mock.calls.length > 0);
    expect(starts).toBe(1);
    expect(loggedLine(warn, '[cron] still running; skipping this tick', 'hook=slow')).toBe(true);

    // Once the first run finishes, subsequent ticks fire again.
    release();
    await waitUntil(() => starts >= 2);

    scheduler.stop();
    db.close();
  });

  test('an empty hook list is a no-op that still returns a usable handle', async () => {
    const db = await freshDb();
    const { store } = fakeOperationStore();
    const scheduler = startCronScheduler(db, [], store);
    await sleep(20);
    expect(() => scheduler.stop()).not.toThrow();
    db.close();
  });

  test('a dailyAtHour hook with runOnStart fires at boot and stop() halts it', async () => {
    const db = await freshDb();
    const { store, completed } = fakeOperationStore();
    let calls = 0;
    const scheduler = startCronScheduler(
      db,
      [hook('daily', async () => void calls++, { runOnStart: true, intervalSeconds: undefined, dailyAtHour: 9 })],
      store,
    );

    await waitUntil(() => calls === 1);
    expect(calls).toBe(1);
    await waitUntil(() => completed.length === 1);

    // The next real firing is up to a day out, so nothing else lands here.
    scheduler.stop();
    await sleep(60);
    expect(calls).toBe(1);
    db.close();
  });
});

describe('nextDailyFire', () => {
  test('returns today at the target hour when it is still ahead', () => {
    const from = new Date(2026, 0, 15, 6, 30, 0); // 06:30 local
    const next = nextDailyFire(from, 9);
    expect(next).toEqual(new Date(2026, 0, 15, 9, 0, 0, 0));
  });

  test('rolls to tomorrow when the target hour has passed', () => {
    const from = new Date(2026, 0, 15, 9, 30, 0); // 09:30, past 09:00
    const next = nextDailyFire(from, 9);
    expect(next).toEqual(new Date(2026, 0, 16, 9, 0, 0, 0));
  });

  test('rolls to tomorrow when exactly at the target hour (avoids an immediate re-fire)', () => {
    const from = new Date(2026, 0, 15, 9, 0, 0, 0);
    const next = nextDailyFire(from, 9);
    expect(next).toEqual(new Date(2026, 0, 16, 9, 0, 0, 0));
  });

  test('crosses a month boundary correctly', () => {
    const from = new Date(2026, 0, 31, 23, 0, 0); // Jan 31, 23:00
    const next = nextDailyFire(from, 9);
    expect(next).toEqual(new Date(2026, 1, 1, 9, 0, 0, 0)); // Feb 1, 09:00
  });
});
