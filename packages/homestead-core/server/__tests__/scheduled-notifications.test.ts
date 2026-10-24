/**
 * Unit tests for the scheduling helper.
 *
 * The producer-facing behaviour is covered by each app's own cron tests; what
 * is tested here is the part they all depend on and none of them can see — the
 * two invariants that keep a reconcile from fighting the person it's for:
 *
 *  - a past row is never deleted here (platform retention sweeps old ones), so
 *    a cancelled row outlives the plan entry it's suppressing;
 *  - a row that has already been delivered or cancelled is never rewritten.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => {
  const state = {
    users: [] as Row[],
    queue: {} as Record<string, Row[]>,
    nextId: 1,
  };
  const writes = {
    created: [] as Array<Row & { userId: string }>,
    updated: [] as Array<{ userId: string; id: string; patch: Row }>,
    deleted: [] as Array<{ userId: string; id: string }>,
  };
  const queueFor = (userId: string) => ({
    listAll: async () => state.queue[userId] ?? [],
    get: async () => (state.queue[userId] ?? [])[0],
    create: async (payload: Row) => {
      const row = { id: `new-${state.nextId++}`, ...payload };
      (state.queue[userId] ??= []).push(row);
      writes.created.push({ ...row, userId });
      return row;
    },
    record: (id: string) => ({
      get: async () => (state.queue[userId] ?? []).find((r) => r.id === id),
      update: async (patch: Row) => {
        writes.updated.push({ userId, id, patch });
        const row = (state.queue[userId] ?? []).find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        return row;
      },
      delete: async () => {
        writes.deleted.push({ userId, id });
        state.queue[userId] = (state.queue[userId] ?? []).filter((r) => r.id !== id);
      },
    }),
  });
  const fakeHs = {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          listAll: async () => state.users,
          record: (userId: string) => ({ collection: () => queueFor(userId) }),
        };
      }
      return { listAll: async () => [] };
    },
  };
  return { state, writes, fakeHs };
});

vi.mock('../client', () => ({ serverClient: () => h.fakeHs }));

import {
  cancelScheduledNotification,
  fanOut,
  reconcileScheduled,
  toUtcInstant,
  type PlannedNotification,
} from '../scheduled-notifications';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const at = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

function plan(overrides: Partial<PlannedNotification> = {}): PlannedNotification {
  return {
    userId: 'u1',
    sourceKey: 'pickup:2026-06-16',
    title: 'Bins out tonight',
    message: 'Trash.',
    url: '/home',
    sendAt: at(1),
    ...overrides,
  };
}

beforeEach(() => {
  h.state.users = [{ id: 'u1' }, { id: 'u2' }];
  h.state.queue = {};
  h.state.nextId = 1;
  h.writes.created = [];
  h.writes.updated = [];
  h.writes.deleted = [];
});

describe('toUtcInstant', () => {
  test('normalizes an offset instant to UTC, so string compares are time compares', () => {
    // The dispatcher selects with `send_at <= '<now>'`, which the engine
    // compiles to a SQL string comparison. A local-offset string would sort
    // wrong and either fire early or never.
    expect(toUtcInstant('2026-06-16T18:00:00-07:00')).toBe('2026-06-17T01:00:00.000Z');
  });

  test('refuses an unparseable instant instead of storing an undeliverable row', () => {
    expect(() => toUtcInstant('whenever')).toThrow(/unparseable/);
  });
});

describe('fanOut', () => {
  test('addresses one plan to each recipient', () => {
    const rows = fanOut({ sourceKey: 'k', title: 't', message: 'm', sendAt: at(1) }, [
      'u1',
      'u2',
    ]);
    expect(rows.map((r) => r.userId)).toEqual(['u1', 'u2']);
  });

  test('nobody opted in means nothing planned', () => {
    expect(fanOut({ sourceKey: 'k', title: 't', message: 'm', sendAt: at(1) }, [])).toEqual(
      [],
    );
  });
});

describe('reconcileScheduled', () => {
  test('creates what the plan implies and nothing else', async () => {
    const result = await reconcileScheduled('t', 'home', [plan()], { now: NOW });

    expect(result).toMatchObject({ created: 1, updated: 0, withdrawn: 0 });
    expect(h.writes.created[0]).toMatchObject({
      userId: 'u1',
      source_app: 'home',
      status: 'scheduled',
    });
  });

  test('a second run over the same plan writes nothing', async () => {
    await reconcileScheduled('t', 'home', [plan()], { now: NOW });
    const result = await reconcileScheduled('t', 'home', [plan()], { now: NOW });

    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
  });

  test('drifted content is patched in place', async () => {
    await reconcileScheduled('t', 'home', [plan()], { now: NOW });
    const result = await reconcileScheduled(
      't',
      'home',
      [plan({ title: 'Bins out tonight: Trash and Recycling' })],
      { now: NOW },
    );

    expect(result).toMatchObject({ updated: 1 });
    expect(h.writes.updated[0].patch).toMatchObject({
      title: 'Bins out tonight: Trash and Recycling',
    });
  });

  test('a future row nothing implies any more is withdrawn', async () => {
    await reconcileScheduled('t', 'home', [plan()], { now: NOW });
    const result = await reconcileScheduled('t', 'home', [], { now: NOW });

    expect(result).toMatchObject({ withdrawn: 1 });
    expect(h.state.queue.u1).toHaveLength(0);
  });

  test('another app’s rows are invisible to this reconcile', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'ev',
          source_app: 'events',
          source_key: 'e1:day_of:2026',
          send_at: at(2),
          status: 'scheduled',
        },
      ],
    };

    const result = await reconcileScheduled('t', 'home', [], { now: NOW });

    expect(result).toMatchObject({ withdrawn: 0 });
    expect(h.writes.deleted).toHaveLength(0);
  });

  test('a row a person scheduled themselves is invisible too', async () => {
    h.state.queue = {
      u1: [{ id: 'mine', title: 'Call the plumber', send_at: at(2), status: 'scheduled' }],
    };

    const result = await reconcileScheduled('t', 'home', [], { now: NOW });

    expect(result).toMatchObject({ withdrawn: 0 });
  });

  // The invariant that makes cancelling an app's notification actually stick.
  test('a cancelled row is not rewritten, and not resurrected', async () => {
    await reconcileScheduled('t', 'home', [plan()], { now: NOW });
    await cancelScheduledNotification('t', 'u1', h.state.queue.u1[0].id as string);
    h.writes.updated = [];

    const result = await reconcileScheduled('t', 'home', [plan()], { now: NOW });

    // Still in the plan, but the person said no — so it stays cancelled and
    // stays put. Under a delete-based cancel this row would be back.
    expect(result).toMatchObject({ created: 0, updated: 0, settled: 1 });
    expect(h.writes.updated).toHaveLength(0);
    expect(h.state.queue.u1[0]).toMatchObject({ status: 'canceled' });
  });

  test('a delivered row is left as the record of what was sent', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'sent',
          source_app: 'home',
          source_key: plan().sourceKey,
          send_at: at(1),
          status: 'sent',
          title: 'stale title',
        },
      ],
    };

    const result = await reconcileScheduled('t', 'home', [plan()], { now: NOW });

    expect(result).toMatchObject({ settled: 1, updated: 0, created: 0 });
    expect(h.state.queue.u1[0].title).toBe('stale title');
  });

  test('a cancelled future row survives its plan — it is the tombstone', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'future-cancelled',
          source_app: 'home',
          source_key: plan().sourceKey,
          send_at: at(1),
          status: 'canceled',
        },
      ],
    };

    const result = await reconcileScheduled('t', 'home', [plan()], { now: NOW });

    // Deleting it would let the plan recreate it — "no, not this week" would
    // come back every night.
    expect(result).toMatchObject({ settled: 1, created: 0, withdrawn: 0 });
    expect(h.state.queue.u1).toHaveLength(1);
  });

  test('a long-past row is left for platform retention, not deleted here', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'old',
          source_app: 'home',
          source_key: 'pickup:2026-05-01',
          send_at: at(-40),
          status: 'sent',
        },
      ],
    };

    const result = await reconcileScheduled('t', 'home', [], { now: NOW });

    expect(result).toMatchObject({ withdrawn: 0 });
    expect(h.writes.deleted).toHaveLength(0);
    expect(h.state.queue.u1).toHaveLength(1);
  });

  test('every user is visited, not only those in the plan', async () => {
    await reconcileScheduled('t', 'home', [plan(), plan({ userId: 'u2' })], {
      now: NOW,
    });

    // u2 drops out of the plan entirely. If the sweep only walked users the
    // plan named, their row would be stranded forever.
    const result = await reconcileScheduled('t', 'home', [plan()], { now: NOW });

    expect(result).toMatchObject({ withdrawn: 1, unchanged: 1 });
    expect(h.state.queue.u2).toHaveLength(0);
  });

  test('a plan entry with no source key is a programming error, not a silent create', async () => {
    await expect(
      reconcileScheduled('t', 'home', [{ ...plan(), sourceKey: undefined }], {
        now: NOW,
      }),
    ).rejects.toThrow(/sourceKey/);
  });

  // One app, two producers. Without a key prefix each run would see the
  // other's rows as "nothing implies this any more" and withdraw them.
  describe('keyPrefix', () => {
    const taskPlan = () =>
      plan({ sourceKey: 'task:t1:2026-06-20', title: 'Home upkeep: gutters' });

    test('a sibling producer’s rows under the same source_app are out of scope', async () => {
      await reconcileScheduled('t', 'home', [plan()], {
        now: NOW,
        keyPrefix: 'pickup:',
      });
      h.writes.deleted = [];

      const result = await reconcileScheduled('t', 'home', [taskPlan()], {
        now: NOW,
        keyPrefix: 'task:',
      });

      expect(result).toMatchObject({ created: 1, withdrawn: 0 });
      expect(h.writes.deleted).toHaveLength(0);
      expect(h.state.queue.u1).toHaveLength(2);
    });

    test('within its own scope it still withdraws what nothing implies', async () => {
      await reconcileScheduled('t', 'home', [taskPlan()], {
        now: NOW,
        keyPrefix: 'task:',
      });

      const result = await reconcileScheduled('t', 'home', [], {
        now: NOW,
        keyPrefix: 'task:',
      });

      expect(result).toMatchObject({ withdrawn: 1 });
    });

    test('a plan outside the declared scope throws rather than writing an orphan', async () => {
      await expect(
        reconcileScheduled('t', 'home', [plan()], { now: NOW, keyPrefix: 'task:' }),
      ).rejects.toThrow(/outside the reconciled scope/);
    });
  });
});

describe('cancelScheduledNotification', () => {
  test('a row that already fired is left exactly as it is', async () => {
    h.state.queue = { u1: [{ id: 'x', status: 'sent', send_at: at(-1) }] };

    await cancelScheduledNotification('t', 'u1', 'x');

    // Cancelling something that went out a second ago must not rewrite history.
    expect(h.writes.updated).toHaveLength(0);
    expect(h.state.queue.u1[0].status).toBe('sent');
  });
});
