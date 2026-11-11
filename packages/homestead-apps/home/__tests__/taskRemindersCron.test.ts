/**
 * Unit tests for the `home-task-reminders` cron handler.
 *
 * The engine client is mocked with an in-memory per-user notification queue, so
 * what's under test is the handler's own logic: reading each household member's
 * opt-in, turning a task's cadence and lead time into a reminder instant,
 * carrying the notes into the message, chasing an overdue task once a day, and
 * leaving the bin-night rows that share its `source_app` alone.
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
    tasks: [] as Row[],
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
      if (name === 'home-tasks') return { listAll: async () => state.tasks };
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

import handler, {
  buildContent,
  leadDaysOf,
  nextMorningAfter,
  TASK_KEY_PREFIX,
} from '../crons/task-reminders';
import type { HomeTask } from '../types';

/** Fixed clock: 2026-09-07 05:00 local, a Monday. */
const NOW = new Date(2026, 8, 7, 5, 0, 0);

function ctx(): CronContext {
  return {
    id: 'home-task-reminders',
    appId: 'home',
    token: 'admin-token',
    writeOrigin: 'cron:home-task-reminders',
    firedAt: NOW.toISOString(),
    log: async () => {},
  };
}

/** 09:00 local on the day `dayOffset` days from the 7th. */
const morningAt = (dayOffset: number) =>
  new Date(2026, 8, 7 + dayOffset, 9, 0, 0, 0).toISOString();

const filterTask = (over: Partial<HomeTask> = {}): Row => ({
  id: 'task-filter',
  name: 'Replace furnace filter',
  notes: '20x25x1, MERV 11',
  interval_count: 3,
  interval_unit: 'month',
  next_due: '2026-09-10',
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.state.users = [{ id: 'u1' }, { id: 'u2' }];
  h.state.optedIn = ['u1'];
  h.state.tasks = [];
  h.state.queue = {};
  h.state.nextId = 1;
  h.writes.created = [];
  h.writes.updated = [];
  h.writes.deleted = [];
});

describe('leadDaysOf', () => {
  test('defaults to the morning it is due, and clamps a nonsense row', () => {
    expect(leadDaysOf({ lead_days: undefined } as HomeTask)).toBe(0);
    expect(leadDaysOf({ lead_days: 7 } as HomeTask)).toBe(7);
    expect(leadDaysOf({ lead_days: -3 } as HomeTask)).toBe(0);
    expect(leadDaysOf({ lead_days: 5000 } as HomeTask)).toBe(90);
    expect(leadDaysOf({ lead_days: 2.7 } as HomeTask)).toBe(2);
  });
});

describe('nextMorningAfter', () => {
  test('takes today’s slot when it is still ahead, tomorrow’s once it has gone', () => {
    expect(nextMorningAfter(new Date(2026, 8, 7, 5, 0)).toISOString()).toBe(morningAt(0));
    expect(nextMorningAfter(new Date(2026, 8, 7, 14, 0)).toISOString()).toBe(morningAt(1));
    // Exactly on the slot counts as gone — the dispatcher may already have run.
    expect(nextMorningAfter(new Date(2026, 8, 7, 9, 0)).toISOString()).toBe(morningAt(1));
  });
});

describe('buildContent', () => {
  test('carries the cadence and the notes into the message', () => {
    const { title, message } = buildContent(
      filterTask() as unknown as HomeTask,
      new Date(2026, 8, 10),
      3,
    );
    expect(title).toBe('Home upkeep: Replace furnace filter');
    expect(message).toContain('Due Thursday, September 10');
    expect(message).toContain('3 days from now');
    expect(message).toContain('Every 3 months');
    // The whole point of the notes field: the answer arrives with the question.
    expect(message).toContain('20x25x1, MERV 11');
  });

  test('names an overdue task as overdue', () => {
    const { title, message } = buildContent(
      filterTask({ next_due: '2026-09-01' }) as unknown as HomeTask,
      new Date(2026, 8, 1),
      -6,
    );
    expect(title).toBe('Overdue: Replace furnace filter');
    expect(message).toContain('Was due Tuesday, September 1');
  });

  test('works with no notes at all', () => {
    const { message } = buildContent(
      filterTask({ notes: undefined }) as unknown as HomeTask,
      new Date(2026, 8, 7),
      0,
    );
    expect(message).toBe('Due today, Monday, September 7 · Every 3 months');
  });
});

describe('home-task-reminders', () => {
  test('queues a reminder for the morning a task is due', async () => {
    h.state.tasks = [filterTask()];

    const result = await handler(ctx());

    expect(result).toMatchObject({ tasks: 1, planned: 1, created: 1 });
    expect(h.writes.created).toHaveLength(1);
    const row = h.writes.created[0];
    expect(row.userId).toBe('u1');
    expect(row.send_at).toBe(morningAt(3));
    expect(row.source_app).toBe('home');
    expect(row.source_key).toBe(`${TASK_KEY_PREFIX}task-filter:2026-09-10`);
    expect(row.source_collection).toBe('home-tasks');
    expect(row.source_id).toBe('task-filter');
    expect(row.url).toBe('/home');
  });

  test('honours a lead time, reminding that many days early', async () => {
    h.state.tasks = [
      filterTask({ id: 'gutters', name: 'Clean gutters', next_due: '2026-09-14', lead_days: 7 }),
    ];

    await handler(ctx());

    // Due the 14th, 7 days' notice → the morning of the 7th, which is today.
    expect(h.writes.created[0].send_at).toBe(morningAt(0));
  });

  test('addresses one row per opted-in person and none to anyone else', async () => {
    h.state.optedIn = ['u1', 'u2'];
    h.state.tasks = [filterTask()];

    await handler(ctx());

    expect(h.writes.created.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
  });

  test('writes nothing when nobody has opted in', async () => {
    h.state.optedIn = [];
    h.state.tasks = [filterTask()];

    const result = await handler(ctx());

    expect(h.writes.created).toHaveLength(0);
    expect(result).toMatchObject({ optedIn: 0, planned: 0, created: 0 });
  });

  test('withdraws a queued row when the last person opts out', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'existing',
          status: 'scheduled',
          send_at: morningAt(3),
          source_app: 'home',
          source_key: `${TASK_KEY_PREFIX}task-filter:2026-09-10`,
        },
      ],
    };
    h.state.optedIn = [];
    h.state.tasks = [filterTask()];

    const result = await handler(ctx());

    expect(h.writes.deleted).toEqual(['existing']);
    expect(result).toMatchObject({ withdrawn: 1 });
  });

  test('skips a paused task', async () => {
    h.state.tasks = [filterTask({ paused: true })];

    const result = await handler(ctx());

    expect(h.writes.created).toHaveLength(0);
    expect(result).toMatchObject({ tasks: 0, planned: 0 });
  });

  test('chases an overdue task at the next slot, keyed to that day', async () => {
    h.state.tasks = [filterTask({ next_due: '2026-08-20' })];

    await handler(ctx());

    const row = h.writes.created[0];
    // Not a moment in the past — the nudge lands on the next 09:00 slot, which
    // from a 05:00 firing is this morning.
    expect(row.send_at).toBe(morningAt(0));
    expect(row.source_key).toBe(`${TASK_KEY_PREFIX}task-filter:2026-08-20:2026-09-07`);
    expect(row.title).toBe('Overdue: Replace furnace filter');
  });

  test('a task due today is due today, not overdue', async () => {
    h.state.tasks = [filterTask({ next_due: '2026-09-07' })];

    await handler(ctx());

    const row = h.writes.created[0];
    expect(row.send_at).toBe(morningAt(0));
    expect(row.title).toBe('Home upkeep: Replace furnace filter');
    expect(row.message).toContain('Due today');
    // Its slot is still ahead, so this is the plain key — no daily chase yet.
    expect(row.source_key).toBe(`${TASK_KEY_PREFIX}task-filter:2026-09-07`);
  });

  test('a run that starts after today’s slot queues tomorrow, not a missed row', async () => {
    // A boot catch-up at 14:00: 09:00 has gone, and writing into the past only
    // ever produces a row the dispatcher marks `missed`.
    const afternoon = new Date(2026, 8, 7, 14, 0, 0);
    vi.setSystemTime(afternoon);
    h.state.tasks = [filterTask({ next_due: '2026-09-07' })];

    await handler({ ...ctx(), firedAt: afternoon.toISOString() });

    const row = h.writes.created[0];
    expect(row.send_at).toBe(morningAt(1));
    expect(row.source_key).toBe(`${TASK_KEY_PREFIX}task-filter:2026-09-07:2026-09-08`);
    // Delivered tomorrow, so it reads as a day late by then.
    expect(row.title).toBe('Overdue: Replace furnace filter');
  });

  test('leaves a task whose reminder is beyond the horizon alone', async () => {
    h.state.tasks = [filterTask({ next_due: '2027-01-01' })];

    const result = await handler(ctx());

    expect(h.writes.created).toHaveLength(0);
    expect(result).toMatchObject({ tasks: 1, planned: 0 });
  });

  test('is idempotent — a second run rewrites nothing', async () => {
    h.state.tasks = [filterTask()];
    await handler(ctx());
    h.writes.created = [];

    const result = await handler(ctx());

    expect(h.writes.created).toHaveLength(0);
    expect(h.writes.updated).toHaveLength(0);
    expect(result).toMatchObject({ unchanged: 1 });
  });

  test('patches a row in place when the task is renamed', async () => {
    h.state.tasks = [filterTask()];
    await handler(ctx());
    h.state.tasks = [filterTask({ name: 'Swap furnace filter' })];

    const result = await handler(ctx());

    expect(h.writes.updated).toHaveLength(1);
    expect(h.writes.updated[0].patch.title).toBe('Home upkeep: Swap furnace filter');
    expect(result).toMatchObject({ updated: 1 });
  });

  test('never touches the bin-night rows that share its source_app', async () => {
    // Both Home producers stamp `source_app: 'home'`; only the key prefix keeps
    // this run from sweeping the pickup cron's queue as "nothing implies it".
    h.state.queue = {
      u1: [
        {
          id: 'bin-night',
          status: 'scheduled',
          send_at: new Date(2026, 8, 9, 18, 0, 0, 0).toISOString(),
          source_app: 'home',
          source_key: 'pickup:2026-09-10',
        },
      ],
    };
    h.state.tasks = [filterTask()];

    await handler(ctx());

    expect(h.writes.deleted).toEqual([]);
    expect(h.writes.updated).toEqual([]);
    expect(h.state.queue.u1.some((r) => r.id === 'bin-night')).toBe(true);
  });
});
