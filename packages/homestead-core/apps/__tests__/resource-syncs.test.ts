import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getAllResourceDefs,
  getAllResourceSyncs,
  getPullConnectionResources,
  initializeAppRegistry,
  resetAppRegistry,
  SYNC_STATUS_FIELD_DEF,
} from '../registry';
import { syncPushOf, type PullHandler, type SyncHandler } from '../sync';
import { logger } from '../../utils/logger';
import type { AppConfig } from '../types';

const push: SyncHandler = async () => {};
const pull: PullHandler = async () => {};
const pushLoad = async () => ({ default: push });
const pullLoad = async () => ({ default: pull });

function app(id: string, extra: Partial<AppConfig>): AppConfig {
  return { id, name: id, description: `${id} test app`, ...extra };
}

afterEach(() => {
  resetAppRegistry();
  vi.restoreAllMocks();
});

describe('syncPushOf', () => {
  test('reads the push side from either form', () => {
    expect(syncPushOf({ id: 'a', resource: 'r', on: ['create'], load: pushLoad })).toMatchObject({
      on: ['create'],
      load: pushLoad,
    });
    expect(syncPushOf({ id: 'b', resource: 'r', push: { load: pushLoad } })?.load).toBe(pushLoad);
    expect(syncPushOf({ id: 'c', resource: 'r', pull: { every: 60, load: pullLoad } })).toBeUndefined();
  });
});

describe('getAllResourceSyncs', () => {
  test('keeps push, pull and flat syncs; drops malformed ones with a warning', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([
      app('cal', {
        syncs: [
          { id: 'flat', resource: 'event', load: pushLoad },
          {
            id: 'gcal',
            resource: 'event',
            push: { load: pushLoad },
            pull: { connections: 'calendar', every: 900, load: pullLoad },
          },
          { id: 'both-forms', resource: 'event', load: pushLoad, push: { load: pushLoad } },
          { id: 'empty', resource: 'event' },
          { id: 'too-often', resource: 'event', pull: { every: 5, load: pullLoad } },
          { id: 'second-puller', resource: 'event', pull: { connections: 'calendar', every: 60, load: pullLoad } },
        ],
      }),
    ]);

    expect(getAllResourceSyncs().map((s) => s.id)).toEqual(['flat', 'gcal']);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('"both-forms"') && m.includes('both `push` and the flat'))).toBe(true);
    expect(messages.some((m) => m.includes('"empty"') && m.includes('neither a push nor a pull'))).toBe(true);
    expect(messages.some((m) => m.includes('"too-often"') && m.includes('at least 60s'))).toBe(true);
    expect(messages.some((m) => m.includes('"second-puller"') && m.includes('sync "gcal" already does'))).toBe(true);
  });
});

describe('connection resources', () => {
  test('gain the read-only sync_status field; other resources are untouched', () => {
    initializeAppRegistry([
      app('cal', {
        resources: [
          { singular: 'calendar', plural: 'calendars', fields: { url: { type: 'string' } } },
          { singular: 'event', plural: 'events', fields: { title: { type: 'string' } } },
        ],
        syncs: [{ id: 'gcal', resource: 'event', pull: { connections: 'calendar', every: 900, load: pullLoad } }],
      }),
    ]);

    expect([...getPullConnectionResources()]).toEqual(['calendar']);
    const defs = Object.fromEntries(getAllResourceDefs().map((d) => [d.singular, d]));
    expect(defs.calendar.fields.sync_status).toBe(SYNC_STATUS_FIELD_DEF);
    expect(defs.calendar.fields.url).toEqual({ type: 'string' });
    expect(defs.event.fields.sync_status).toBeUndefined();
  });

  test('a connection resource may not declare sync_status itself', () => {
    initializeAppRegistry([
      app('cal', {
        resources: [
          { singular: 'calendar', plural: 'calendars', fields: { sync_status: { type: 'string' } } },
        ],
        syncs: [{ id: 'gcal', resource: 'calendar', pull: { connections: 'calendar', every: 900, load: pullLoad } }],
      }),
    ]);
    expect(() => getAllResourceDefs()).toThrow(/remove the declared one/);
  });
});
