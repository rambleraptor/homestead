/**
 * Unit tests for the calendar's reminder planning.
 *
 * The engine client, the opt-in read, the access check and the queue reconcile
 * are mocked, so what's under test is the plan itself: who is told about what,
 * and when.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PlannedNotification } from '@rambleraptor/homestead-core/server/scheduled-notifications';

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => ({
  users: [] as Row[],
  optedIn: [] as string[],
  calendars: [] as Row[],
  events: {} as Record<string, Row[]>,
  /** `<user>:<calendar id>` pairs that may NOT read. */
  denied: new Set<string>(),
  planned: [] as PlannedNotification[],
}));

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => ({
    collection: (name: string) => {
      if (name === 'users') return { listAll: async () => h.users };
      return {
        listAll: async () => h.calendars,
        record: (calendarId: string) => ({
          collection: () => ({ listAll: async () => h.events[calendarId] ?? [] }),
        }),
      };
    },
  }),
}));
vi.mock('@rambleraptor/homestead-core/server/user-settings', () => ({
  usersWithFlag: async (_token: string, userIds: readonly string[]) =>
    userIds.filter((id) => h.optedIn.includes(id)),
}));
vi.mock('@rambleraptor/homestead-core/server/collection-access', () => ({
  userCanUseRecord: async (userId: string, _resource: string, path: string) =>
    !h.denied.has(`${userId}:${path.split('/')[1]}`),
}));
vi.mock('@rambleraptor/homestead-core/server/scheduled-notifications', async (original) => ({
  ...(await original<typeof import('@rambleraptor/homestead-core/server/scheduled-notifications')>()),
  reconcileScheduled: async (_token: string, _app: string, planned: PlannedNotification[]) => {
    h.planned = [...planned];
    return { created: planned.length, updated: 0, unchanged: 0, withdrawn: 0, settled: 0 };
  },
}));

import { ALL_DAY_HOUR, LEAD_MINUTES, planCalendarReminders } from '../crons/plan';

/** Wednesday 11 Nov 2026, 07:00 local. */
const NOW = new Date(2026, 10, 11, 7, 0, 0);
const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

beforeEach(() => {
  h.users = [{ id: 'u1' }, { id: 'u2' }];
  h.optedIn = ['u1'];
  h.calendars = [{ id: 'family', name: 'Family', color: 'blue' }];
  h.events = {};
  h.denied = new Set();
  h.planned = [];
});

describe('planCalendarReminders', () => {
  test('reminds an opted-in person shortly before a timed event', async () => {
    h.events.family = [
      {
        id: 'dentist',
        title: 'Dentist',
        start: local(11, 9).toISOString(),
        end: local(11, 10).toISOString(),
        location: '12 Oak St',
      },
    ];
    await planCalendarReminders('token', NOW);

    expect(h.planned).toHaveLength(1);
    expect(h.planned[0]).toMatchObject({
      userId: 'u1',
      title: 'Soon: Dentist',
      url: '/calendar',
      sendAt: local(11, 9 - 1, 60 - LEAD_MINUTES).toISOString(),
      sourceKey: `dentist:${local(11, 9).toISOString()}`,
      sourceId: 'dentist',
    });
    expect(h.planned[0]!.message).toContain('12 Oak St');
  });

  test('announces an all-day event on the morning of its first day only', async () => {
    h.events.family = [
      { id: 'trip', title: 'Camping', all_day: true, start: '2026-11-10', end: '2026-11-12' },
      { id: 'fair', title: 'Book fair', all_day: true, start: '2026-11-11', end: '2026-11-11' },
    ];
    await planCalendarReminders('token', NOW);

    // The trip began yesterday; only the fair is announced.
    expect(h.planned.map((p) => p.title)).toEqual(['Today: Book fair']);
    expect(h.planned[0]!.sendAt).toBe(local(11, ALL_DAY_HOUR).toISOString());
  });

  test('plans each occurrence of a repeating event inside the horizon, minus skipped ones', async () => {
    h.events.family = [
      {
        id: 'swim',
        title: 'Swimming',
        start: local(11, 16).toISOString(),
        end: local(11, 17).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        rrule: 'FREQ=DAILY',
        exdates: [local(12, 16).toISOString()],
      },
    ];
    await planCalendarReminders('token', NOW);

    expect(h.planned.map((p) => p.sourceKey)).toEqual([
      `swim:${local(11, 16).toISOString()}`,
      // The 12th is skipped; the 13th's reminder (15:30) is beyond the two-day horizon.
    ]);
  });

  test('writes nothing for a reminder whose moment has already passed', async () => {
    h.events.family = [
      {
        id: 'breakfast',
        title: 'Breakfast',
        start: local(11, 7, 15).toISOString(),
        end: local(11, 8).toISOString(),
      },
    ];
    await planCalendarReminders('token', NOW);
    expect(h.planned).toEqual([]);
  });

  test('tells only the people who can read the calendar', async () => {
    h.optedIn = ['u1', 'u2'];
    h.calendars = [
      { id: 'family', name: 'Family', color: 'blue' },
      { id: 'private', name: 'Private', color: 'red' },
    ];
    const event = (id: string) => ({
      id,
      title: id,
      start: local(11, 12).toISOString(),
      end: local(11, 13).toISOString(),
    });
    h.events.family = [event('lunch')];
    h.events.private = [event('surprise')];
    h.denied.add('u2:private');

    await planCalendarReminders('token', NOW);

    const told = h.planned.map((p) => `${p.userId}:${p.sourceId}`).sort();
    expect(told).toEqual(['u1:lunch', 'u1:surprise', 'u2:lunch']);
  });

  test('still reconciles with nobody opted in, so old rows are withdrawn', async () => {
    h.optedIn = [];
    h.events.family = [
      { id: 'x', title: 'X', start: local(11, 12).toISOString(), end: local(11, 13).toISOString() },
    ];
    const outcome = await planCalendarReminders('token', NOW);
    expect(h.planned).toEqual([]);
    expect(outcome.planned).toBe(0);
  });
});
