/**
 * The change-feed client: SSE framing, and which events turn into which
 * query invalidations. The connection is driven through injected deps, so no
 * network or auth mock is involved.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  connectChangeFeed,
  isChangeFeedConnected,
  parseFrames,
  type ChangeFeedDeps,
} from '../changeFeed';
import {
  clearResourceMetaRegistry,
  registerResourceMutationDefaults,
} from '../registerResourceMutationDefaults';

/** A fake /api/events: each `connect` yields a stream the test pushes into. */
function fakeServer() {
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
        controller.enqueue(encoder.encode(': connected\n\n'));
      },
    });
    return new Response(body, { status: 200 });
  });
  return {
    fetch,
    send(resource: string, event = 'update') {
      streams.at(-1)!.enqueue(
        encoder.encode(`event: change\ndata: ${JSON.stringify({ resource, event })}\n\n`),
      );
    },
    drop() {
      streams.at(-1)!.close();
    },
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
  client = new QueryClient();
  registerResourceMutationDefaults(client, {
    appId: 'groceries',
    singular: 'grocery',
    plural: 'groceries',
  });
});

afterEach(() => {
  stop?.();
  stop = null;
});

describe('parseFrames', () => {
  it('parses complete change frames and keeps the partial tail', () => {
    const { events, rest } = parseFrames(
      ': connected\n\nevent: change\ndata: {"resource":"grocery","event":"create"}\n\nevent: cha',
    );
    expect(events).toEqual([{ resource: 'grocery', event: 'create' }]);
    expect(rest).toBe('event: cha');
  });

  it('ignores other event names and malformed data', () => {
    const { events } = parseFrames(
      'event: other\ndata: {"resource":"x"}\n\nevent: change\ndata: not json\n\n',
    );
    expect(events).toEqual([]);
  });
});

describe('connectChangeFeed', () => {
  it('invalidates the owning app once for a burst of events', async () => {
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));

    server.send('grocery', 'delete');
    server.send('grocery', 'delete');
    server.send('grocery', 'delete');

    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['app', 'groceries'] }),
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(server.fetch.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer tok',
    });
  });

  it('ignores resources no app registered', async () => {
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));

    server.send('mystery');
    await new Promise((r) => setTimeout(r, 400));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('holds off while one of the app’s own writes is in flight', async () => {
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.spyOn(client, 'isMutating').mockReturnValue(1);
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));

    server.send('grocery');
    await new Promise((r) => setTimeout(r, 400));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('reconnects after a drop and refetches what it may have missed', async () => {
    const server = fakeServer();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stop = connectChangeFeed(client, makeDeps(server.fetch));
    await vi.waitFor(() => expect(isChangeFeedConnected()).toBe(true));

    server.drop();
    await vi.waitFor(() => expect(server.fetch).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['app'] }));
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
