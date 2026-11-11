/**
 * Unit tests for the `notifications-dispatch` cron handler.
 *
 * The engine client and the push helper are both mocked, so what's under test
 * is the handler's own decisions: which rows are due, which are too late to be
 * worth sending, and how each outcome is written back onto the row. The row is
 * the delivery ledger here — that is the property most of these tests are
 * really about.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CronContext } from '@rambleraptor/homestead-core/apps/types';

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => {
  const state = {
    users: [] as Row[],
    queue: {} as Record<string, Row[]>,
  };
  const writes = {
    updated: [] as Array<{ userId: string; id: string; patch: Row }>,
  };
  /** Each entry is one `sendNotificationToUser` call. */
  const sends: Array<{ userId: string; options: Row }> = [];
  /** Queued responses, consumed in order; a plain success by default. */
  const sendResults: Array<{ ok: boolean; body?: Row; throws?: boolean }> = [];

  const queueFor = (userId: string) => ({
    /**
     * Applies the handler's `status == 'scheduled' && send_at <= '<now>'`
     * filter, because the handler leans on the engine to do that selection and
     * a fake that ignored it would test the wrong thing.
     */
    listAll: async (options?: { filter?: string }) => {
      const rows = state.queue[userId] ?? [];
      const cutoff = /send_at <= '([^']+)'/.exec(options?.filter ?? '')?.[1];
      return rows.filter(
        (r) =>
          r.status === 'scheduled' &&
          (!cutoff || String(r.send_at ?? '') <= cutoff),
      );
    },
    record: (id: string) => ({
      update: async (patch: Row) => {
        writes.updated.push({ userId, id, patch });
        const row = (state.queue[userId] ?? []).find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        return row;
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
  return { state, writes, sends, sendResults, fakeHs };
});

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => h.fakeHs,
}));
vi.mock('@rambleraptor/homestead-core/server/notifications', () => ({
  sendNotificationToUser: async (_token: string, userId: string, options: Row) => {
    h.sends.push({ userId, options });
    const next = h.sendResults.shift() ?? { ok: true, body: { notificationId: 'n1' } };
    if (next.throws) throw new Error('push exploded');
    return {
      ok: next.ok,
      json: async () => next.body ?? {},
      text: async () => JSON.stringify(next.body ?? {}),
    } as unknown as Response;
  },
}));

import handler, { LATE_GRACE_HOURS, MAX_ATTEMPTS, backoffMs } from '../crons/dispatch';

/** Fixed clock: 2026-06-15 18:00 UTC. */
const NOW = new Date('2026-06-15T18:00:00.000Z');

function ctx(): CronContext {
  return {
    id: 'notifications-dispatch',
    appId: 'notifications',
    token: 'admin-token',
    writeOrigin: 'cron:notifications-dispatch',
    firedAt: NOW.toISOString(),
    log: async () => {},
  };
}

/** An instant `hours` from NOW; negative is in the past. */
const at = (hours: number) =>
  new Date(NOW.getTime() + hours * 3_600_000).toISOString();

function queued(overrides: Row = {}): Row {
  return {
    id: 'q1',
    title: 'Bins out tonight',
    message: 'Trash and Recycling.',
    url: '/home',
    send_at: at(-0.5),
    status: 'scheduled',
    ...overrides,
  };
}

beforeEach(() => {
  h.state.users = [{ id: 'u1' }];
  h.state.queue = {};
  h.writes.updated = [];
  h.sends.length = 0;
  h.sendResults.length = 0;
});

describe('notifications dispatch', () => {
  test('a due notification is sent and the row records what happened', async () => {
    h.state.queue = { u1: [queued()] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ due: 1, sent: 1, missed: 0, failed: 0 });
    expect(h.sends[0]).toMatchObject({
      userId: 'u1',
      options: {
        title: 'Bins out tonight',
        body: 'Trash and Recycling.',
        url: '/home',
        notificationType: 'reminder',
        scheduledFor: queued().send_at,
      },
    });
    expect(h.writes.updated[0].patch).toMatchObject({
      status: 'sent',
      attempts: 1,
      notification_id: 'n1',
    });
  });

  test('a notification whose moment has not come is left alone', async () => {
    h.state.queue = { u1: [queued({ send_at: at(1) })] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ due: 0, sent: 0 });
    expect(h.sends).toHaveLength(0);
  });

  test('sending twice is impossible — the row is the ledger', async () => {
    h.state.queue = { u1: [queued()] };
    await handler(ctx());
    const result = await handler(ctx());

    // No inbox replay, no dedup set: the first run flipped `status`, so the
    // second run's filter simply doesn't match it.
    expect(result).toMatchObject({ due: 0, sent: 0 });
    expect(h.sends).toHaveLength(1);
  });

  test('a notification too late to be useful is marked missed, not sent', async () => {
    h.state.queue = { u1: [queued({ send_at: at(-(LATE_GRACE_HOURS + 1)) })] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ due: 1, sent: 0, missed: 1 });
    expect(h.sends).toHaveLength(0);
    expect(h.writes.updated[0].patch).toMatchObject({ status: 'missed' });
  });

  test('a notification late but still inside the grace window goes out', async () => {
    h.state.queue = { u1: [queued({ send_at: at(-(LATE_GRACE_HOURS - 1)) })] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ sent: 1, missed: 0 });
  });

  test('a failed send stays scheduled so the next tick retries', async () => {
    h.sendResults.push({ ok: false, body: { error: 'no VAPID keys' } });
    h.state.queue = { u1: [queued()] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ sent: 0, retried: 1, failed: 0 });
    expect(h.writes.updated[0].patch).toMatchObject({
      status: 'scheduled',
      attempts: 1,
    });
  });

  test('a thrown send is caught and retried like any other failure', async () => {
    h.sendResults.push({ ok: false, throws: true });
    h.state.queue = { u1: [queued()] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ retried: 1 });
    expect(h.writes.updated[0].patch).toMatchObject({ status: 'scheduled' });
  });

  test('retries are bounded — a row that keeps failing is given up on', async () => {
    h.state.queue = {
      u1: [queued({ attempts: MAX_ATTEMPTS - 1, update_time: at(-1) })],
    };
    h.sendResults.push({ ok: false, body: { error: 'still broken' } });

    const result = await handler(ctx());

    expect(result).toMatchObject({ failed: 1, retried: 0 });
    expect(h.writes.updated[0].patch).toMatchObject({
      status: 'failed',
      attempts: MAX_ATTEMPTS,
    });
  });

  describe('backoff', () => {
    test('grows then caps, so a failing row does not burn its budget', () => {
      // A 60s tick retrying every tick would spend ten attempts in ten minutes,
      // which is the same bug the larger budget was meant to fix.
      expect(backoffMs(1)).toBe(60_000);
      expect(backoffMs(2)).toBe(120_000);
      expect(backoffMs(3)).toBe(240_000);
      expect(backoffMs(4)).toBe(480_000);
      expect(backoffMs(5)).toBe(900_000);
      expect(backoffMs(9)).toBe(900_000);
      expect(backoffMs(0)).toBe(0);
    });

    test('a recently-failed row is left alone until its backoff elapses', async () => {
      // One prior failure 30 seconds ago; the first backoff is a minute.
      h.state.queue = { u1: [queued({ attempts: 1, update_time: at(-0.5 / 60) })] };

      const result = await handler(ctx());

      expect(result).toMatchObject({ deferred: 1, sent: 0, retried: 0 });
      expect(h.sends).toHaveLength(0);
    });

    test('it is tried again once the backoff has passed', async () => {
      h.state.queue = { u1: [queued({ attempts: 1, update_time: at(-1) })] };

      const result = await handler(ctx());

      expect(result).toMatchObject({ deferred: 0, sent: 1 });
      expect(h.writes.updated[0].patch).toMatchObject({ status: 'sent', attempts: 2 });
    });

    test('an outage longer than the old two-minute budget now survives', async () => {
      // Five prior failures, last one 20 minutes ago — well past the 15m cap.
      h.state.queue = { u1: [queued({ attempts: 5, update_time: at(-1 / 3) })] };

      const result = await handler(ctx());

      expect(result).toMatchObject({ sent: 1, failed: 0 });
    });

    test('too late to send beats still backing off', async () => {
      // Stale enough to be missed, and mid-backoff. Marking it missed stops the
      // retries; deferring first would leave it spinning until the budget ran out.
      h.state.queue = {
        u1: [
          queued({
            send_at: at(-(LATE_GRACE_HOURS + 1)),
            attempts: 1,
            update_time: at(-0.1 / 60),
          }),
        ],
      };

      const result = await handler(ctx());

      expect(result).toMatchObject({ missed: 1, deferred: 0 });
    });

    test('a row with no update_time is attempted rather than stuck', async () => {
      h.state.queue = { u1: [queued({ attempts: 2 })] };

      const result = await handler(ctx());

      expect(result).toMatchObject({ sent: 1, deferred: 0 });
    });
  });

  test('an unparseable instant fails rather than being re-read every minute', async () => {
    // It has to sort *before* the cutoff to be selected at all — the engine
    // compares `send_at` as a string, so garbage that sorts late is simply
    // never picked up. Garbage that sorts early is, and would otherwise be
    // re-read on every tick forever.
    h.state.queue = { u1: [queued({ send_at: '0001-not-a-date' })] };

    const result = await handler(ctx());

    expect(result).toMatchObject({ failed: 1 });
    expect(h.sends).toHaveLength(0);
    expect(h.writes.updated[0].patch).toMatchObject({ status: 'failed' });
  });

  test('each user is dispatched independently', async () => {
    h.state.users = [{ id: 'u1' }, { id: 'u2' }];
    h.state.queue = {
      u1: [queued({ id: 'a' })],
      u2: [queued({ id: 'b', title: 'Perk expiring' })],
    };

    const result = await handler(ctx());

    expect(result).toMatchObject({ users: 2, due: 2, sent: 2 });
    expect(h.sends.map((s) => s.userId).sort()).toEqual(['u1', 'u2']);
  });

  test('a row with no url still has somewhere to land', async () => {
    h.state.queue = { u1: [queued({ url: undefined })] };

    await handler(ctx());

    expect(h.sends[0].options.url).toBe('/notifications');
  });
});
