import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { initializeAppRegistry, resetAppRegistry } from '../../../apps/registry';
import { setRecordAccessResolver } from '../../collection-access';
import { setPullTrigger, type PullTriggerResult } from '../../sync-pulls';
import { allSyncNowCustomMethods, syncNowCustomMethod } from '../method';
import syncNow from '../handler';
import type { CustomMethodContext } from '../../../resources/types';

let allowed: boolean;
let result: PullTriggerResult;
const asked: Array<{ resource: string; path: string; verb?: string }> = [];

beforeEach(() => {
  allowed = true;
  result = 'queued';
  asked.length = 0;
  initializeAppRegistry([
    {
      id: 'cal',
      name: 'Calendar',
      description: 'test',
      resources: [
        { singular: 'calendar', plural: 'calendars', parents: ['user'], fields: { url: { type: 'string' } } },
        { singular: 'event', plural: 'events', fields: { title: { type: 'string' } } },
      ],
      syncs: [
        { id: 'gcal', resource: 'event', pull: { connections: 'calendar', every: 900, load: async () => ({ default: async () => {} }) } },
      ],
    },
  ]);
  setRecordAccessResolver(async (_token, resource, path, verb) => {
    asked.push({ resource, path, verb });
    return allowed;
  });
  setPullTrigger((resource, path) => {
    asked.push({ resource, path });
    return result;
  });
});

afterEach(() => {
  resetAppRegistry();
  setRecordAccessResolver(null);
  setPullTrigger(null);
});

function ctx(plural = 'calendars'): CustomMethodContext {
  return {
    request: new Request('http://x/'),
    auth: { token: 't', user: { id: 'u1', path: 'users/u1', email: 'a@b.c' } },
    plural,
    verb: 'sync',
    target: 'item',
    id: 'c1',
    parent: ['users', 'u1'],
  };
}

describe(':sync', () => {
  test('is synthesized only on pull connection resources', () => {
    expect(syncNowCustomMethod('calendars', 'sync')).toMatchObject({ target: 'item' });
    expect(syncNowCustomMethod('events', 'sync')).toBeUndefined();
    expect(syncNowCustomMethod('calendars', 'other')).toBeUndefined();
    expect(Object.keys(allSyncNowCustomMethods())).toEqual(['calendars:sync']);
  });

  test('queues a pull of the addressed connection for someone who may edit it', async () => {
    const res = await syncNow(ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: true });
    expect(asked).toEqual([
      { resource: 'calendar', path: 'users/u1/calendars/c1', verb: 'write' },
      { resource: 'calendar', path: 'users/u1/calendars/c1' },
    ]);
  });

  test("answers 404 when the caller can't edit it, without triggering", async () => {
    allowed = false;
    const res = await syncNow(ctx());
    expect(res.status).toBe(404);
    expect(asked).toHaveLength(1);
  });

  test('reports an unknown connection and a scheduler that is not running', async () => {
    result = 'unknown';
    expect((await syncNow(ctx())).status).toBe(404);
    result = 'unavailable';
    expect((await syncNow(ctx())).status).toBe(503);
  });
});
