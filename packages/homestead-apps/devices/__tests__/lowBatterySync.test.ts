/**
 * Unit tests for the `devices-low-battery` sync handler.
 *
 * The engine client is mocked with in-memory devices, todos, and a per-user
 * notification queue, so what's under test is the handler's own logic: raising
 * one todo per discharge, notifying only whoever opted in, staying quiet on the
 * reports that follow, and closing the todo + re-arming on recharge.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SyncContext } from '@rambleraptor/homestead-core/apps/types';

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => {
  const state = {
    devices: {} as Record<string, Row>,
    todos: {} as Record<string, Row>,
    users: [] as Row[],
    optedIn: [] as string[],
    queued: [] as Array<Row & { userId: string }>,
    nextId: 1,
  };
  const fakeHs = {
    collection: (name: string) => {
      if (name === 'device-infos') {
        return {
          record: (id: string) => ({
            get: async () => ({ ...state.devices[id] }),
            update: async (patch: Row) => Object.assign(state.devices[id], patch),
          }),
        };
      }
      if (name === 'todos') {
        return {
          create: async (body: Row) => {
            const row = { id: `todo-${state.nextId++}`, ...body };
            state.todos[row.id as string] = row;
            return row;
          },
          get: async (id: string) => {
            if (!state.todos[id]) throw new Error('404');
            return { ...state.todos[id] };
          },
          record: (id: string) => ({
            update: async (patch: Row) => Object.assign(state.todos[id], patch),
          }),
        };
      }
      if (name === 'users') return { listAll: async () => state.users };
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return { state, fakeHs };
});

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => h.fakeHs,
}));
vi.mock('@rambleraptor/homestead-core/server/user-settings', () => ({
  usersWithFlag: async (_token: string, userIds: readonly string[]) =>
    userIds.filter((id) => h.state.optedIn.includes(id)),
}));
vi.mock('@rambleraptor/homestead-core/server/scheduled-notifications', () => ({
  fanOut: (plan: Row, userIds: string[]) => userIds.map((userId) => ({ ...plan, userId })),
  scheduleNotification: async (_token: string, plan: Row & { userId: string }) => {
    h.state.queued.push(plan);
    return plan;
  },
}));

import handler, { notificationContent, todoTitle } from '../syncs/low-battery';

function ctx(over: Partial<SyncContext> = {}): SyncContext {
  return {
    id: 'devices-low-battery',
    appId: 'devices',
    resource: 'device-info',
    event: 'update',
    recordId: 'fridge-panel',
    record: null,
    previous: null,
    token: 'tok',
    firedAt: '2026-09-24T12:00:00Z',
    log: async () => undefined,
    ...over,
  };
}

function report(patch: Row) {
  Object.assign(h.state.devices['fridge-panel'], patch);
  return handler(ctx());
}

beforeEach(() => {
  h.state.devices = { 'fridge-panel': { id: 'fridge-panel', name: 'Fridge panel', battery_percent: 60 } };
  h.state.todos = {};
  h.state.users = [{ id: 'u1' }, { id: 'u2' }];
  h.state.optedIn = ['u1'];
  h.state.queued = [];
  h.state.nextId = 1;
});

describe('devices-low-battery sync', () => {
  test('does nothing while the battery is healthy', async () => {
    expect(await report({ battery_percent: 55 })).toEqual({ action: 'none' });
    expect(Object.keys(h.state.todos)).toHaveLength(0);
  });

  test('raises one todo and notifies only opted-in people when the battery runs low', async () => {
    const result = await report({ battery_percent: 18 });

    expect(result).toMatchObject({ action: 'alerted', notified: 1 });
    const todos = Object.values(h.state.todos);
    expect(todos).toEqual([
      expect.objectContaining({ title: 'Charge the Fridge panel', status: 'pending' }),
    ]);
    expect(h.state.devices['fridge-panel']).toMatchObject({
      low_battery_alerted: true,
      charge_todo: todos[0]!.id,
    });
    expect(h.state.queued).toEqual([
      expect.objectContaining({
        userId: 'u1',
        title: 'Fridge panel battery low',
        url: '/todos',
        sourceId: 'fridge-panel',
      }),
    ]);
  });

  test('stays quiet on the reports that follow, including its own re-fire', async () => {
    await report({ battery_percent: 18 });
    await handler(ctx());
    await report({ battery_percent: 17 });
    await report({ battery_percent: 21 });
    await report({ battery_percent: 19 });

    expect(Object.keys(h.state.todos)).toHaveLength(1);
    expect(h.state.queued).toHaveLength(1);
  });

  test('a deleted todo is a dismissal, not a request for a new one', async () => {
    await report({ battery_percent: 18 });
    // The engine's `set-null` clears the pointer when the todo is deleted.
    h.state.todos = {};
    await report({ charge_todo: null });
    await report({ battery_percent: 15 });

    expect(Object.keys(h.state.todos)).toHaveLength(0);
  });

  test('checks the todo off and re-arms once recharged', async () => {
    await report({ battery_percent: 18 });
    const todoId = h.state.devices['fridge-panel']!.charge_todo as string;

    const result = await report({ battery_percent: 85 });

    expect(result).toEqual({ action: 'rearmed', closedTodo: true });
    expect(h.state.todos[todoId]).toMatchObject({ status: 'completed' });
    expect(h.state.devices['fridge-panel']).toMatchObject({
      low_battery_alerted: false,
      charge_todo: null,
    });

    await report({ battery_percent: 12 });
    expect(Object.keys(h.state.todos)).toHaveLength(2);
  });

  test('plugging in counts as recharged', async () => {
    await report({ battery_percent: 18 });
    expect(await report({ battery_percent: 19, charging: true })).toMatchObject({
      action: 'rearmed',
    });
  });

  test('leaves a todo someone already cancelled alone on recharge', async () => {
    await report({ battery_percent: 18 });
    const todoId = h.state.devices['fridge-panel']!.charge_todo as string;
    h.state.todos[todoId]!.status = 'cancelled';

    expect(await report({ battery_percent: 90 })).toEqual({
      action: 'rearmed',
      closedTodo: false,
    });
    expect(h.state.todos[todoId]).toMatchObject({ status: 'cancelled' });
  });

  test('honours a per-device threshold', async () => {
    expect(await report({ battery_percent: 35, low_threshold: 40 })).toMatchObject({
      action: 'alerted',
    });
  });

  test('ignores an unreadable battery and deletes', async () => {
    expect(await report({ battery_percent: undefined })).toEqual({ action: 'none' });
    expect(await handler(ctx({ event: 'delete' }))).toEqual({ action: 'none' });
  });

  test('still raises the todo with nobody opted in', async () => {
    h.state.optedIn = [];
    expect(await report({ battery_percent: 10 })).toMatchObject({
      action: 'alerted',
      notified: 0,
    });
    expect(Object.keys(h.state.todos)).toHaveLength(1);
  });
});

describe('content', () => {
  test('names the device and its charge', () => {
    const device = { id: 'd', name: 'Doorbell', battery_percent: 9.6 };
    expect(todoTitle(device)).toBe('Charge the Doorbell');
    expect(notificationContent(device)).toEqual({
      title: 'Doorbell battery low',
      message: 'Doorbell is at 10% — time to charge it.',
    });
  });
});
