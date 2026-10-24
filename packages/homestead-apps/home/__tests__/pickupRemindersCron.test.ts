/**
 * Unit tests for the `home-pickup-reminders` cron handler.
 *
 * The engine client is mocked with an in-memory per-user notification queue, so
 * what's under test is the handler's own logic: reading each household member's
 * opt-in, folding a collection day's streams into one notification due the
 * evening before, addressing it to whoever opted in, and reconciling with what
 * an earlier run wrote.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CronContext } from '@rambleraptor/homestead-core/apps/types';

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => {
  const state = {
    users: [] as Row[],
    optedIn: [] as string[],
    pickups: [] as Row[],
    /** The delivery queue, per user — `/users/{id}/scheduled-notifications`. */
    queue: {} as Record<string, Row[]>,
    nextId: 1,
  };
  const writes = {
    created: [] as Array<Row & { userId: string }>,
    updated: [] as Array<{ id: string; patch: Row }>,
    deleted: [] as string[],
  };
  const queueFor = (userId: string) => ({
    listAll: async () => state.queue[userId] ?? [],
    create: async (payload: Row) => {
      const row = { id: `new-${state.nextId++}`, ...payload };
      (state.queue[userId] ??= []).push(row);
      writes.created.push({ ...row, userId });
      return row;
    },
    record: (id: string) => ({
      update: async (patch: Row) => {
        writes.updated.push({ id, patch });
        const row = (state.queue[userId] ?? []).find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        return row;
      },
      delete: async () => {
        writes.deleted.push(id);
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
      if (name === 'garbage-pickups') return { listAll: async () => state.pickups };
      return { listAll: async () => [] };
    },
  };
  return { state, writes, fakeHs };
});

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => h.fakeHs,
}));
vi.mock('@rambleraptor/homestead-core/server/user-settings', () => ({
  usersWithFlag: async (_token: string, userIds: readonly string[]) =>
    userIds.filter((id) => h.state.optedIn.includes(id)),
}));

import handler, { buildContent, joinStreams } from '../crons/pickup-reminders';

/** Fixed clock: 2026-06-15 04:00 local, a Monday. */
const NOW = new Date(2026, 5, 15, 4, 0, 0);

function ctx(): CronContext {
  return {
    id: 'home-pickup-reminders',
    appId: 'home',
    token: 'admin-token',
    firedAt: NOW.toISOString(),
    log: async () => {},
  };
}

/** 18:00 local on the day `dayOffset` days from the 15th. */
const eveningAt = (dayOffset: number) =>
  new Date(2026, 5, 15 + dayOffset, 18, 0, 0, 0).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.state.users = [{ id: 'u1' }, { id: 'u2' }];
  h.state.optedIn = ['u1'];
  h.state.pickups = [];
  h.state.queue = {};
  h.state.nextId = 1;
  h.writes.created = [];
  h.writes.updated = [];
  h.writes.deleted = [];
});

describe('joinStreams', () => {
  test('reads as a sentence, however many there are', () => {
    expect(joinStreams([])).toBe('');
    expect(joinStreams(['Trash'])).toBe('Trash');
    expect(joinStreams(['Trash', 'Recycling'])).toBe('Trash and Recycling');
    expect(joinStreams(['Trash', 'Recycling', 'Compost'])).toBe(
      'Trash, Recycling and Compost',
    );
  });
});

describe('buildContent', () => {
  test('names the bins and the day they go out', () => {
    expect(buildContent(['garbage', 'recyclable'], '2026-06-16')).toEqual({
      title: 'Bins out tonight: Trash and Recycling',
      notes: 'Trash and Recycling are collected tomorrow, Tuesday, June 16.',
    });
  });

  test('agrees with a single stream', () => {
    expect(buildContent(['garbage'], '2026-06-16').notes).toBe(
      'Trash is collected tomorrow, Tuesday, June 16.',
    );
  });
});

describe('pickup reminders', () => {
  test('one collection day becomes one queued notification, the evening before', async () => {
    h.state.pickups = [
      { id: 'p1', pickup_date: '2026-06-16', stream: 'garbage' },
      { id: 'p2', pickup_date: '2026-06-16', stream: 'recyclable' },
    ];

    const result = await handler(ctx());

    // One opt-in, so one plan entry and one row — under that person, because
    // a scheduled notification is addressed by the user it's parented under.
    expect(result).toMatchObject({ optedIn: 1, planned: 1, created: 1 });
    expect(h.writes.created[0]).toMatchObject({
      userId: 'u1',
      title: 'Bins out tonight: Trash and Recycling',
      message: 'Trash and Recycling are collected tomorrow, Tuesday, June 16.',
      send_at: eveningAt(0),
      url: '/home',
      source_app: 'home',
      source_key: 'pickup:2026-06-16',
      status: 'scheduled',
    });
  });

  test('nobody opted in means nothing is written', async () => {
    h.state.optedIn = [];
    h.state.pickups = [{ id: 'p1', pickup_date: '2026-06-16', stream: 'garbage' }];

    const result = await handler(ctx());

    expect(result).toMatchObject({ planned: 0, created: 0 });
  });

  test('everyone opted in gets their own row', async () => {
    h.state.optedIn = ['u1', 'u2'];
    h.state.pickups = [{ id: 'p1', pickup_date: '2026-06-16', stream: 'garbage' }];

    const result = await handler(ctx());

    // Fan-out happens here, at schedule time, rather than at delivery: two
    // people means two rows, each under its own parent.
    expect(result).toMatchObject({ planned: 2, created: 2 });
    expect(h.writes.created.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
    expect(h.state.queue.u1).toHaveLength(1);
    expect(h.state.queue.u2).toHaveLength(1);
  });

  test('today’s collection is not announced — that evening has gone', async () => {
    h.state.pickups = [{ id: 'p1', pickup_date: '2026-06-15', stream: 'garbage' }];
    const result = await handler(ctx());
    expect(result).toMatchObject({ planned: 0 });
  });

  test('a collection beyond the horizon waits for a later run', async () => {
    h.state.pickups = [{ id: 'p1', pickup_date: '2026-07-20', stream: 'garbage' }];
    const result = await handler(ctx());
    expect(result).toMatchObject({ planned: 0 });
  });

  test('a duplicated stream on one day is only named once', async () => {
    h.state.pickups = [
      { id: 'p1', pickup_date: '2026-06-16', stream: 'garbage' },
      { id: 'p2', pickup_date: '2026-06-16', stream: 'garbage' },
    ];

    await handler(ctx());

    expect(h.writes.created[0].title).toBe('Bins out tonight: Trash');
  });

  test('a second run over the same schedule writes nothing', async () => {
    h.state.pickups = [{ id: 'p1', pickup_date: '2026-06-16', stream: 'garbage' }];
    await handler(ctx());
    h.writes.created = [];

    const result = await handler(ctx());

    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
  });

  test('a holiday shift moves the reminder it already wrote', async () => {
    h.state.pickups = [{ id: 'p1', pickup_date: '2026-06-16', stream: 'garbage' }];
    await handler(ctx());

    // The hauler pushed the day; the sync rewrote the row, so the old date is
    // no longer implied and the new one is.
    h.state.pickups = [
      { id: 'p1', pickup_date: '2026-06-17', stream: 'garbage', status: 'delayed' },
    ];
    const result = await handler(ctx());

    expect(result).toMatchObject({ created: 1, withdrawn: 1 });
    expect(h.state.queue.u1).toHaveLength(1);
    expect(h.state.queue.u1[0]).toMatchObject({
      source_key: 'pickup:2026-06-17',
      send_at: eveningAt(1),
    });
  });

  test('opting out withdraws the rows already written', async () => {
    h.state.pickups = [{ id: 'p1', pickup_date: '2026-06-16', stream: 'garbage' }];
    await handler(ctx());
    expect(h.state.queue.u1).toHaveLength(1);

    h.state.optedIn = [];
    const result = await handler(ctx());

    // The reconcile still visits every user, not only those in the plan —
    // otherwise the last opt-out would leave its rows behind forever.
    expect(result).toMatchObject({ withdrawn: 1 });
    expect(h.state.queue.u1).toHaveLength(0);
  });

  test('a notification from another app is never touched', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'e1',
          title: 'Today: Mum’s birthday',
          send_at: new Date(2026, 5, 20, 9).toISOString(),
          status: 'scheduled',
          source_app: 'events',
          source_key: 'ev1:day_of:2026',
        },
      ],
    };
    h.state.pickups = [];

    const result = await handler(ctx());

    expect(result).toMatchObject({ withdrawn: 0 });
    expect(h.writes.deleted).toHaveLength(0);
  });

  test('a long-past bin night is left for platform retention', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'old',
          title: 'Bins out tonight: Trash',
          send_at: new Date(2026, 4, 1, 18).toISOString(),
          status: 'sent',
          source_app: 'home',
          source_key: 'pickup:2026-05-02',
        },
      ],
    };

    await handler(ctx());

    expect(h.writes.deleted).toHaveLength(0);
  });
});
