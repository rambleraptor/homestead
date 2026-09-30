/**
 * The change-feed client: SSE framing, resume, echo suppression, and how
 * events reach the cache. The connection is driven through injected deps, so
 * no network or auth mock is involved.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  connectChangeFeed,
  isChangeFeedConnected,
  parseFrames,
  type ChangeFeedDeps,
} from '../changeFeed';
import { getClientId } from '../clientId';
import { queryKeys } from '../queryClient';
import {
  clearResourceMetaRegistry,
  registerResourceMutationDefaults,
} from '../registerResourceMutationDefaults';
import { clearListShapes, registerListShape } from '../resourceEvents';

interface Item {
  id: string;
  name: string;
}

const LIST = queryKeys.app('groceries').resource('grocery').list();

/** A fake /api/events: each connection is a stream the test writes frames into. */
function fakeServer(ready: { resumed: boolean; last_event_id: string } = { resumed: false, last_event_id: 'e.0' }) {
  const encoder = new TextEncoder();
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streams.push(controller);
        init.signal?.addEventListener('abort', () => {
          try {
            controller.error(new DOMException('aborted', 'AbortError'));
          } catch {
            // already closed
          }
        });
        controller.enqueue(
          encoder.encode(`event: stream.ready\ndata: ${JSON.stringify({ version: 1, ...ready })}\n\n`),
        );
      },
    });
    return new Response(body, { status: 200 });
  });
  let seq = 0;
  return {
    fetch,
    headersOf: (call: number) => fetch.mock.calls[call]![1].headers as Record<string, string>,
    setReady(next: typeof ready) {
      ready = next;
    },
    send(type: string, data: Record<string, unknown>) {
      seq += 1;
      streams.at(-1)!.enqueue(
        encoder.encode(`id: e.${seq}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    },
    drop() {
      streams.at(-1)!.close();
    },
  };
}

function resourceEvent(id: string, name: string, origin: string | null = 'someone-else') {
  return {
    resource: 'grocery',
    path: `groceries/${id}`,
    id,
    actor: 'users/sam',
    origin,
    update_time: '2026-09-30T00:00:00Z',
    record: { id, path: `groceries/${id}`, name },
  };
}

function makeDeps(fetch: ChangeFeedDeps['fetch'], online = true): ChangeFeedDeps {
  return {
    fetch,
    getToken: () => 'tok',
    refresh: async () => true,
    isOnline: () => online,
    onOnlineChange: () => () => {},
    isVisible: () => true,
    onVisibilityChange: () => () => {},
  };
}

let client: QueryClient;
let stop: (() => void) | null = null;

beforeEach(() => {
  clearResourceMetaRegistry();
  clearListShapes();
  client = new QueryClient();
  registerResourceMutationDefaults(client, {
    appId: 'groceries',
    singular: 'grocery',
    plural: 'groceries',
  });
  client.setQueryData<Item[]>(LIST, [{ id: 'a', name: 'Apples' }]);
});

afterEach(() => {
  stop?.();
  stop = null;
});

describe('parseFrames', () => {
  it('parses complete frames with ids and keeps the partial tail', () => {
    const { frames, rest } = parseFrames(
      ': keepalive\n\nid: e.4\nevent: resource.created\ndata: {"id":"x"}\n\nevent: res',
    );
    expect(frames).toEqual([{ id: 'e.4', event: 'resource.created', data: { id: 'x' } }]);
    expect(rest).toBe('event: res');
  });

  it('drops frames whose data is not JSON', () => {
    expect(parseFrames('event: resource.created\ndata: nope\n\n').frames).toEqual([]);
  });
});

describe('connectChangeFeed', () => {
  it('writes another device’s record straight into a list with a registered shape', async () => {
    registerListShape('groceries', 'grocery', { complete: true });
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));

    server.send('resource.created', resourceEvent('b', 'Bread'));

    await vi.waitFor(() =>
      expect(client.getQueryData<Item[]>(LIST)?.map((r) => r.id)).toEqual(['a', 'b']),
    );
    // The app's other queries are refreshed, but not the slot just patched.
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    const { predicate } = invalidate.mock.calls[0]![0] as {
      predicate: (q: { queryKey: readonly unknown[] }) => boolean;
    };
    expect(predicate({ queryKey: LIST })).toBe(false);
    expect(predicate({ queryKey: queryKeys.app('groceries').resource('store').list() })).toBe(true);
  });

  it('falls back to invalidating the app, once per burst, when it cannot patch', async () => {
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));

    server.send('resource.created', resourceEvent('b', 'Bread'));
    server.send('resource.created', resourceEvent('c', 'Cheese'));

    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['app', 'groceries'], predicate: undefined }),
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('skips the echo of this tab’s own writes', async () => {
    registerListShape('groceries', 'grocery', { complete: true });
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));

    server.send('resource.created', resourceEvent('b', 'Bread', getClientId()));
    await new Promise((r) => setTimeout(r, 400));

    expect(client.getQueryData<Item[]>(LIST)).toHaveLength(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('resumes from the last event id after a drop, refetching nothing', async () => {
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));
    server.send('resource.deleted', { ...resourceEvent('a', 'Apples'), record: undefined });
    await vi.waitFor(() => expect(client.getQueryData<Item[]>(LIST)).toEqual([]));

    server.setReady({ resumed: true, last_event_id: 'e.1' });
    server.drop();
    await vi.waitFor(() => expect(server.fetch).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));

    expect(server.headersOf(1)['Last-Event-ID']).toBe('e.1');
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['app'] });
  });

  it('refetches everything when the server cannot resume', async () => {
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));
    // A fresh first connection never refetches: the queries just loaded.
    expect(invalidate).not.toHaveBeenCalled();

    server.drop();
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['app'] }), {
      timeout: 3_000,
    });
    // It resumes from the head the server reported, not from nothing.
    expect(server.headersOf(1)['Last-Event-ID']).toBe('e.0');
  });

  it('does not connect while offline', async () => {
    const server = fakeServer();
    stop = connectChangeFeed(client, makeDeps(server.fetch, false));
    await new Promise((r) => setTimeout(r, 50));
    expect(server.fetch).not.toHaveBeenCalled();
    expect(isChangeFeedConnected()).toBe(false);
  });

  it('reports disconnected once stopped', async () => {
    const server = fakeServer();
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));
    stop();
    stop = null;
    expect(isChangeFeedConnected()).toBe(false);
  });
});
