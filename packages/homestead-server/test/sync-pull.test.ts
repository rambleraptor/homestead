/**
 * The pull scheduler against a real in-memory engine: connections are found
 * and pulled, cursors and pages carry over, failures back off and show in the
 * connection's `sync_status`, and what a pull writes isn't pushed back out.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { call, defineResource, makeEngine, seedUser, type TestEngine } from './engine/helpers';
import { createPullScheduler, pullOperationMethod, STATE_TABLE, type PullScheduler } from '../src/sync-pull';
import { createSyncDispatcher, type DurableSyncDispatcher } from '../src/sync';
import { teeDispatcher } from '../src/change-feed';
import { TYPE_SUPERUSER } from '../src/engine/types';
import { SYNC_STATUS_FIELD_DEF, type RegisteredResourceSync } from '@rambleraptor/homestead-core/apps/registry';
import {
  ResyncRequired,
  type PullContext,
  type PullHandler,
  type SyncHandler,
  type SyncStatus,
} from '@rambleraptor/homestead-core/apps/sync';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import type { FieldDef } from '@rambleraptor/homestead-core/resources/types';
import type {
  CompleteOperationInput,
  CreateOperationInput,
  Operation,
  OperationStore,
} from '@rambleraptor/homestead-core/resources/operations';

const FEED_FIELDS: Record<string, FieldDef> = {
  url: { type: 'string' },
  sync_status: SYNC_STATUS_FIELD_DEF,
};
const ITEM_FIELDS: Record<string, FieldDef> = {
  title: { type: 'string' },
  feed: { type: 'string' },
};
const DEFS = [
  { singular: 'feed', plural: 'feeds', parents: [] as string[] },
  { singular: 'item', plural: 'items', parents: [] as string[] },
  { singular: 'account', plural: 'accounts', parents: ['user'] },
];

function fakeOperations() {
  const created: CreateOperationInput[] = [];
  const completed: CompleteOperationInput[] = [];
  let seq = 0;
  const store: OperationStore = {
    async create(input) {
      created.push(input);
      return { id: `op-${++seq}`, path: `operations/op-${seq}`, done: false } as Operation;
    },
    async complete(input) {
      completed.push(input);
    },
    async updateMetadata() {},
  };
  return { store, created, completed };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timed out');
    await sleep(5);
  }
}

let t: TestEngine;
const running: Array<{ stop(): void }> = [];

beforeEach(async () => {
  t = await makeEngine();
  for (const [singular, plural, fields, parents] of [
    ['feed', 'feeds', FEED_FIELDS, []],
    ['item', 'items', ITEM_FIELDS, []],
    ['account', 'accounts', FEED_FIELDS, ['user']],
  ] as const) {
    const res = await defineResource(
      t,
      { singular, plural, parents, schema: toWireSchema(fields, singular), user_settable_create: true },
      singular,
    );
    expect(res.ok).toBe(true);
  }
});

afterEach(() => {
  for (const r of running.splice(0)) r.stop();
  delete process.env.HOMESTEAD_SYNC_REDELIVERY_MS;
  vi.restoreAllMocks();
  t.engine.db.close();
});

function pullSync(load: PullHandler, extra: Partial<RegisteredResourceSync> = {}): RegisteredResourceSync {
  return {
    id: 'feeds',
    appId: 'test-app',
    resource: 'item',
    pull: { connections: 'feed', every: 60, load: async () => ({ default: load }) },
    ...extra,
  };
}

/** A scheduler wired to see the engine's writes, as in `createApp`. */
function scheduler(
  syncs: RegisteredResourceSync[],
  options: { now?: () => number; push?: DurableSyncDispatcher } = {},
) {
  const ops = fakeOperations();
  const s = createPullScheduler(t.engine, syncs, DEFS, ops.store, { now: options.now });
  t.engine.setSyncDispatcher(options.push ? teeDispatcher(options.push, s) : s);
  running.push(s);
  return { s, ...ops };
}

async function createFeed(id: string, url: string): Promise<void> {
  const res = await call(t.engine, 'POST', `/feeds?id=${id}`, { token: t.adminToken, body: { url } });
  expect(res.status).toBe(201);
}

async function getJson(path: string): Promise<Record<string, unknown>> {
  const res = await call(t.engine, 'GET', path, { token: t.adminToken });
  return (await res.json()) as Record<string, unknown>;
}

async function statusOf(path: string): Promise<SyncStatus | undefined> {
  return (await getJson(path)).sync_status as SyncStatus | undefined;
}

/** Write an item as the pull handler would, tagged with its write origin. */
async function writeItem(ctx: PullContext, id: string, title: string): Promise<void> {
  const res = await t.engine.fetch(
    new Request(`http://localhost:8090/items?id=${id}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
        'X-Homestead-Client': ctx.writeOrigin,
      },
      body: JSON.stringify({ title, feed: String(ctx.connection?.id) }),
    }),
  );
  if (!res.ok) throw new Error(`item write → ${res.status}`);
}

function stateRows(): Array<{ connection: string; cursor: string | null; failures: number }> {
  return t.engine.db
    .query(`SELECT connection, cursor, failures FROM ${STATE_TABLE} ORDER BY connection`)
    .all() as Array<{ connection: string; cursor: string | null; failures: number }>;
}

describe('pull scheduler', () => {
  test('at start, pulls each connection page by page and records how it went', async () => {
    await createFeed('f1', 'https://example.test/a.ics');
    const seen: Array<Pick<PullContext, 'cursor' | 'page'> & { url: unknown }> = [];
    const { s, created, completed } = scheduler([
      pullSync(async (ctx) => {
        seen.push({ cursor: ctx.cursor, page: ctx.page, url: ctx.connection?.url });
        if (ctx.page === 1) {
          await writeItem(ctx, 'i1', 'Soccer');
          return { cursor: 'page-2', more: true };
        }
        return { cursor: 'v1' };
      }),
    ]);

    await s.start();
    await waitUntil(() => seen.length === 2);
    await s.idle();

    expect(seen).toEqual([
      { cursor: null, page: 1, url: 'https://example.test/a.ics' },
      { cursor: 'page-2', page: 2, url: 'https://example.test/a.ics' },
    ]);
    expect(stateRows()).toEqual([{ connection: 'feeds/f1', cursor: 'v1', failures: 0 }]);
    const status = await statusOf('/feeds/f1');
    expect(status).toMatchObject({ state: 'ok' });
    expect(status?.last_success_time).toBe(status?.last_attempt_time);
    expect(Date.parse(status!.next_time)).toBeGreaterThan(Date.now() + 50_000);
    // It wrote an item, so the run was recorded.
    expect(created.map((o) => o.method)).toEqual([pullOperationMethod('feeds')]);
    expect(completed[0].response).toEqual({ connection: 'feeds/f1', pages: 2, writes: 1 });
  });

  test('a run that writes nothing leaves no operation behind', async () => {
    await createFeed('f1', 'u');
    let runs = 0;
    const { s, created } = scheduler([pullSync(async () => void runs++)]);
    await s.start();
    await waitUntil(() => runs === 1);
    await s.idle();
    expect(created).toEqual([]);
    expect(await statusOf('/feeds/f1')).toMatchObject({ state: 'ok' });
  });

  test('pulls a connection as soon as it is created; an edit clears its cursor; a delete stops it', async () => {
    const calls: Array<{ path: unknown; cursor: string | null }> = [];
    const { s } = scheduler([
      pullSync(async (ctx) => {
        calls.push({ path: ctx.connection?.path, cursor: ctx.cursor });
        return { cursor: 'v1' };
      }),
    ]);
    await s.start();

    await createFeed('f1', 'one');
    await waitUntil(() => calls.length === 1);
    await s.idle();

    const res = await call(t.engine, 'PATCH', '/feeds/f1', { token: t.adminToken, body: { url: 'two' } });
    expect(res.ok).toBe(true);
    await waitUntil(() => calls.length === 2);
    await s.idle();
    expect(calls).toEqual([
      { path: 'feeds/f1', cursor: null },
      { path: 'feeds/f1', cursor: null },
    ]);

    await call(t.engine, 'DELETE', '/feeds/f1', { token: t.adminToken });
    expect(stateRows()).toEqual([]);
    expect(s.trigger('feed', 'feeds/f1')).toBe('unknown');
  });

  test('a failing run shows the error, backs off, and recovers', async () => {
    process.env.HOMESTEAD_SYNC_REDELIVERY_MS = '60000';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await createFeed('f1', 'u');
    let clock = Date.now();
    let failing = true;
    let runs = 0;
    const { s, created, completed } = scheduler(
      [
        pullSync(async () => {
          runs++;
          if (failing) throw new Error('feed returned 500');
          return { cursor: 'v2' };
        }),
      ],
      { now: () => clock },
    );
    await s.start();
    await waitUntil(() => runs === 1);
    await s.idle();

    const failed = await statusOf('/feeds/f1');
    expect(failed).toMatchObject({ state: 'error', last_error: 'feed returned 500' });
    expect(failed?.last_success_time).toBeUndefined();
    expect(Date.parse(failed!.next_time)).toBe(clock + 60_000);
    expect(stateRows()[0].failures).toBe(1);
    // Failures are always recorded.
    expect(created).toHaveLength(1);
    expect(completed[0].error).toBeInstanceOf(Error);

    // Nothing runs before the retry is due…
    expect(s.trigger('feed', 'feeds/f1')).toBe('queued');
    await waitUntil(() => runs === 2);
    await s.idle();
    failing = false;
    // …and the next one succeeds, clearing the error.
    clock += 60_000;
    s.trigger('feed', 'feeds/f1');
    await waitUntil(() => runs === 3);
    await s.idle();
    const ok = await statusOf('/feeds/f1');
    expect(ok).toMatchObject({ state: 'ok' });
    expect(ok?.last_error).toBeUndefined();
    expect(stateRows()[0]).toMatchObject({ cursor: 'v2', failures: 0 });
  });

  test('ResyncRequired clears the cursor and starts over once', async () => {
    await createFeed('f1', 'u');
    const cursors: Array<string | null> = [];
    const { s } = scheduler([
      pullSync(async (ctx) => {
        cursors.push(ctx.cursor);
        if (ctx.cursor === 'stale') throw new ResyncRequired('sync token expired');
        return { cursor: 'fresh' };
      }),
    ]);
    t.engine.db
      .query(`INSERT INTO ${STATE_TABLE} (sync_id, connection, cursor, next_run_at, update_time) VALUES (?, ?, ?, 0, '')`)
      .run('feeds', 'feeds/f1', 'stale');

    await s.start();
    await waitUntil(() => cursors.length === 2);
    await s.idle();
    expect(cursors).toEqual(['stale', null]);
    expect(stateRows()[0].cursor).toBe('fresh');
  });

  test('a client cannot write sync_status; only the scheduler can', async () => {
    await createFeed('f1', 'u');
    const res = await call(t.engine, 'PATCH', '/feeds/f1', {
      token: t.adminToken,
      body: { sync_status: { state: 'ok' }, url: 'v' },
    });
    expect(res.ok).toBe(true);
    const record = await getJson('/feeds/f1');
    expect(record.url).toBe('v');
    expect(record.sync_status ?? null).toBeNull();
  });

  test("what a pull writes isn't pushed back out; a person's edit is", async () => {
    await createFeed('f1', 'u');
    const pushed: Array<{ title: unknown; origin: string | null }> = [];
    const push: SyncHandler = async (ctx) => void pushed.push({ title: ctx.record?.title, origin: ctx.origin });
    const sync = pullSync(async (ctx) => {
      await writeItem(ctx, 'i1', 'From the feed');
    });
    sync.push = { load: async () => ({ default: push }) };
    const pushDispatcher = createSyncDispatcher(t.engine.db, [sync], fakeOperations().store);
    running.push(pushDispatcher);
    const { s } = scheduler([sync], { push: pushDispatcher });

    await s.start();
    await waitUntil(async () => (await call(t.engine, 'GET', '/items/i1', { token: t.adminToken })).ok);
    await s.idle();
    await call(t.engine, 'PATCH', '/items/i1', { token: t.adminToken, body: { title: 'Edited' } });
    await waitUntil(() => pushed.length === 1);
    await pushDispatcher.idle();

    expect(pushed).toEqual([{ title: 'Edited', origin: null }]);
  });

  test('finds user-parented connections, and runs a household-wide pull once', async () => {
    const { user } = await seedUser(t.engine, { email: 'sam@example.com', type: TYPE_SUPERUSER });
    const res = await call(t.engine, 'POST', `/users/${user.id}/accounts?id=a1`, {
      token: t.adminToken,
      body: { url: 'cal' },
    });
    expect(res.status).toBe(201);

    const accounts: unknown[] = [];
    let household = 0;
    const { s } = scheduler([
      {
        id: 'accounts',
        appId: 'test-app',
        resource: 'item',
        pull: { connections: 'account', every: 60, load: async () => ({ default: async (ctx) => void accounts.push(ctx.connection?.path) }) },
      },
      {
        id: 'household',
        appId: 'test-app',
        resource: 'item',
        pull: {
          every: 60,
          load: async () => ({
            default: async (ctx) => {
              expect(ctx.connection).toBeNull();
              household++;
            },
          }),
        },
      },
    ]);
    await s.start();
    await waitUntil(() => accounts.length === 1 && household === 1);
    await s.idle();
    expect(accounts).toEqual([`users/${user.id}/accounts/a1`]);
    expect(await statusOf(`/users/${user.id}/accounts/a1`)).toMatchObject({ state: 'ok' });
  });

  test('trigger runs a pull now, queues one more while running, and is unavailable before start', async () => {
    await createFeed('f1', 'u');
    let release!: () => void;
    let gate = new Promise<void>((r) => (release = r));
    let runs = 0;
    const { s } = scheduler([
      pullSync(async () => {
        runs++;
        await gate;
      }),
    ]);
    expect(s.trigger('feed', 'feeds/f1')).toBe('unavailable');

    await s.start();
    await waitUntil(() => runs === 1);
    // Asked twice mid-run: exactly one more run follows.
    expect(s.trigger('feed', 'feeds/f1')).toBe('queued');
    expect(s.trigger('feed', 'feeds/f1')).toBe('queued');
    const first = release;
    gate = Promise.resolve();
    first();
    await waitUntil(() => runs === 2);
    await s.idle();
    await sleep(20);
    expect(runs).toBe(2);
    expect(s.trigger('item', 'items/x')).toBe('unknown');
  });

  test('an edit made while a pull runs starts the next run over from scratch', async () => {
    await createFeed('f1', 'one');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls: Array<{ cursor: string | null; url: unknown }> = [];
    const { s } = scheduler([
      pullSync(async (ctx) => {
        calls.push({ cursor: ctx.cursor, url: ctx.connection?.url });
        if (calls.length === 1) await gate;
        return { cursor: `after-${calls.length}` };
      }),
    ]);
    await s.start();
    await waitUntil(() => calls.length === 1);
    await call(t.engine, 'PATCH', '/feeds/f1', { token: t.adminToken, body: { url: 'two' } });
    release();
    await waitUntil(() => calls.length === 2);
    await s.idle();
    // The first run's cursor didn't survive the edit.
    expect(calls).toEqual([
      { cursor: null, url: 'one' },
      { cursor: null, url: 'two' },
    ]);
    expect(stateRows()[0].cursor).toBe('after-2');
  });

  test('drops state for connections that disappeared while the server was down', async () => {
    const { s } = scheduler([pullSync(async () => {})]);
    t.engine.db
      .query(`INSERT INTO ${STATE_TABLE} (sync_id, connection, next_run_at, update_time) VALUES (?, ?, 0, '')`)
      .run('feeds', 'feeds/gone');
    await s.start();
    await s.idle();
    expect(stateRows()).toEqual([]);
  });
});
