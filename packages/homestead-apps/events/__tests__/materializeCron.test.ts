/**
 * Unit tests for the `events-materialize-reminders` cron handler.
 *
 * The engine client is mocked with an in-memory per-user notification queue
 * that records writes, so what's under test is the handler's real logic:
 * expanding each user's per-event lead into send instants, fanning the plan out
 * to one row per person who opted in, and reconciling against what a previous
 * run already wrote (including withdrawing one nobody wants any more).
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CronContext } from '@rambleraptor/homestead-core/apps/types';

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => {
  const state = {
    events: [] as Row[],
    users: [] as Row[],
    prefsByUser: {} as Record<string, Row[]>,
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
          record: (userId: string) => ({
            // The handler reads `event-reminders` under a user; the reconcile
            // reads and writes `scheduled-notifications` under the same parent.
            collection: (child: string) =>
              child === 'event-reminders'
                ? { listAll: async () => state.prefsByUser[userId] ?? [] }
                : queueFor(userId),
          }),
        };
      }
      if (name === 'events') return { listAll: async () => state.events };
      return { listAll: async () => [] };
    },
  };
  return { state, writes, fakeHs };
});

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => h.fakeHs,
}));

import handler from '../crons/materialize';
import { nextOccurrence } from '../utils/eventDate';

/** Fixed clock: 2026-06-15 01:00 local. `nextOccurrence` reads `new Date()`. */
const NOW = new Date(2026, 5, 15, 1, 0, 0);

function ctx(): CronContext {
  return {
    id: 'events-materialize-reminders',
    appId: 'events',
    token: 'admin-token',
    firedAt: NOW.toISOString(),
    log: async () => {},
  };
}

/** The 09:00 instant on the day `dayOffset` days from the 15th. */
const morningAt = (dayOffset: number) =>
  new Date(2026, 5, 15 + dayOffset, 9, 0, 0, 0).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.state.events = [];
  h.state.users = [{ id: 'u1' }, { id: 'u2' }];
  h.state.prefsByUser = {};
  h.state.queue = {};
  h.state.nextId = 1;
  h.writes.created = [];
  h.writes.updated = [];
  h.writes.deleted = [];
});

describe('events materializer', () => {
  test('a day-of opt-in becomes a notification queued for that morning', async () => {
    // June 22 — a week out, so day_of is outside the horizon; use June 15.
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 15 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ planned: 1, created: 1 });
    expect(h.writes.created[0]).toMatchObject({
      userId: 'u1',
      title: 'Today: Mum’s birthday',
      send_at: morningAt(0),
      url: '/events',
      source_app: 'events',
      source_key: 'e1:day_of:2026',
      status: 'scheduled',
    });
  });

  test('a week-before opt-in is due seven days ahead of the event', async () => {
    // June 22 is a week out, so the week-before moment is this morning.
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 22 }];
    h.state.prefsByUser = {
      u1: [{ id: 'p1', event_id: 'e1', lead: 'week_before' }],
    };

    await handler(ctx());

    expect(h.writes.created).toHaveLength(1);
    expect(h.writes.created[0]).toMatchObject({
      title: 'Next week: Mum’s birthday',
      send_at: morningAt(0),
      source_key: 'e1:week_before:2026',
    });
  });

  test('`both` expands into two notifications when both moments are in range', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 22 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'both' }] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ planned: 2, created: 2 });
    expect(h.writes.created.map((r) => r.source_key).sort()).toEqual([
      'e1:day_of:2026',
      'e1:week_before:2026',
    ]);
  });

  test('a lead whose moment has already gone by is not backfilled', async () => {
    // The event is tomorrow, so its week-before moment was six days ago —
    // outside the horizon's one-day tail. Only day_of lands.
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 16 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'both' }] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ planned: 1 });
    expect(h.writes.created[0]).toMatchObject({ source_key: 'e1:day_of:2026' });
  });

  test('everyone who opted in for a lead gets their own row', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 15 }];
    h.state.prefsByUser = {
      u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }],
      u2: [{ id: 'p2', event_id: 'e1', lead: 'both' }],
    };

    const result = await handler(ctx());

    // Two people wanting the same moment is two rows now, not one row naming
    // two people — the fan-out happens here rather than at delivery.
    expect(result).toMatchObject({ planned: 2, created: 2 });
    expect(h.writes.created.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
    expect(h.writes.created.every((r) => r.source_key === 'e1:day_of:2026')).toBe(true);
  });

  test('an event nobody opted into produces nothing', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 15 }];
    const result = await handler(ctx());
    expect(result).toMatchObject({ planned: 0, created: 0 });
  });

  test('an event beyond the horizon waits for a later run', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 8, day: 1 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'both' }] };
    const result = await handler(ctx());
    expect(result).toMatchObject({ planned: 0 });
  });

  test('an event with no usable date is skipped', async () => {
    h.state.events = [{ id: 'e1', name: 'Broken', month: 13, day: 40 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }] };
    const result = await handler(ctx());
    expect(result).toMatchObject({ planned: 0, created: 0 });
  });

  test('a second run over the same state writes nothing', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 15 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }] };

    await handler(ctx());
    h.writes.created = [];
    const result = await handler(ctx());

    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(h.writes.created).toHaveLength(0);
  });

  test('a renamed event repoints the notification it already wrote', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 15 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }] };
    await handler(ctx());

    h.state.events[0].name = 'Mother’s birthday';
    const result = await handler(ctx());

    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(h.writes.updated[0].patch).toMatchObject({
      title: 'Today: Mother’s birthday',
    });
  });

  test('a new opt-in gets their own row, leaving the existing one alone', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 16 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }] };
    await handler(ctx());
    h.writes.created = [];

    h.state.prefsByUser.u2 = [{ id: 'p2', event_id: 'e1', lead: 'day_of' }];
    const result = await handler(ctx());

    // Under the old household row this was a patch to `notify_users`, which
    // meant touching a row that had nothing to do with the new person.
    expect(result).toMatchObject({ created: 1, unchanged: 1, updated: 0 });
    expect(h.writes.created[0]).toMatchObject({ userId: 'u2' });
  });

  test('the last opt-out withdraws a future notification', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 16 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }] };
    await handler(ctx());
    const written = h.state.queue.u1[0].id as string;

    h.state.prefsByUser = {};
    const result = await handler(ctx());

    expect(result).toMatchObject({ withdrawn: 1 });
    expect(h.writes.deleted).toEqual([written]);
  });

  test('a notification whose moment has passed is left alone (retention sweeps it later)', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'old',
          title: 'Today: Mum’s birthday',
          send_at: new Date(2026, 5, 14, 9).toISOString(),
          status: 'sent',
          source_app: 'events',
          source_key: 'e1:day_of:2026',
        },
      ],
    };

    const first = await handler(ctx());
    expect(first).toMatchObject({ withdrawn: 0 });

    // However old, deleting it is platform retention's job, not this cron's.
    h.state.queue.u1[0].send_at = new Date(2026, 3, 1, 9).toISOString();
    await handler(ctx());
    expect(h.writes.deleted).toHaveLength(0);
  });

  test('a notification someone scheduled themselves is never touched', async () => {
    h.state.queue = {
      u1: [
        {
          id: 'mine',
          title: 'Call the plumber',
          send_at: new Date(2026, 5, 20, 9).toISOString(),
          status: 'scheduled',
        },
        {
          id: 'theirs',
          title: 'Bins out tonight: Trash',
          send_at: new Date(2026, 5, 20, 18).toISOString(),
          status: 'scheduled',
          source_app: 'home',
          source_key: 'pickup:2026-06-21',
        },
      ],
    };

    const result = await handler(ctx());

    expect(result).toMatchObject({ withdrawn: 0, updated: 0 });
    expect(h.writes.deleted).toHaveLength(0);
  });

  test('a pathed event_id on a preference still matches its event', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 15 }];
    h.state.prefsByUser = {
      u1: [{ id: 'p1', event_id: 'events/e1', lead: 'day_of' }],
    };
    const result = await handler(ctx());
    expect(result).toMatchObject({ created: 1 });
  });

  test('an event carries its age label into the reminder', async () => {
    h.state.events = [
      { id: 'e1', name: 'Mum’s birthday', month: 6, day: 15, year: 1970, tag: 'birthday' },
    ];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }] };
    await handler(ctx());
    expect(h.writes.created[0].message).toBe(
      'Mum’s birthday is today (June 15). Turning 56.',
    );
  });

  test('the reminder is due on the occurrence the recurrence picks', async () => {
    h.state.events = [{ id: 'e1', name: 'Mum’s birthday', month: 6, day: 15 }];
    h.state.prefsByUser = { u1: [{ id: 'p1', event_id: 'e1', lead: 'day_of' }] };
    await handler(ctx());

    const occurrence = nextOccurrence({ month: 6, day: 15 });
    expect(new Date(h.writes.created[0].send_at as string).getDate()).toBe(
      occurrence.getDate(),
    );
  });
});
