/**
 * `/api/events` — the SSE change feed: auth gate, event framing, token
 * re-check on heartbeat, and unsubscribe on disconnect.
 */

import { describe, expect, test } from 'vitest';
import { createChangeFeed, teeDispatcher } from '../../src/change-feed';
import { makeEventsRoute, type AuthFn } from '../../src/routes/events';
import type { SyncDispatchInput } from '../../src/sync';

const authed: AuthFn = async () => ({
  token: 't',
  user: { id: 'u1', email: 'a@example.com' } as never,
});

function input(resource: string, event: SyncDispatchInput['event']): SyncDispatchInput {
  return { resource, event, recordId: 'r1', record: { secret: 'x' }, previous: null };
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(needle)) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe('change feed', () => {
  test('tee fans a dispatch out to every target', () => {
    const feed = createChangeFeed();
    const seen: string[] = [];
    const other = { dispatch: (i: SyncDispatchInput) => seen.push(`sync:${i.resource}`) };
    feed.subscribe((e) => seen.push(`feed:${e.resource}:${e.event}`));
    teeDispatcher(other, feed).dispatch(input('grocery', 'update'));
    expect(seen).toEqual(['sync:grocery', 'feed:grocery:update']);
  });

  test('a throwing listener does not stop the others', () => {
    const feed = createChangeFeed();
    const seen: string[] = [];
    feed.subscribe(() => {
      throw new Error('boom');
    });
    feed.subscribe((e) => seen.push(e.resource));
    feed.dispatch(input('grocery', 'create'));
    expect(seen).toEqual(['grocery']);
  });
});

describe('GET /api/events', () => {
  test('rejects an unauthenticated caller', async () => {
    const app = makeEventsRoute(createChangeFeed(), { auth: async () => null });
    const res = await app.request('/');
    expect(res.status).toBe(401);
  });

  test('streams a change event carrying only resource + kind', async () => {
    const feed = createChangeFeed();
    const app = makeEventsRoute(feed, { auth: authed, heartbeatMs: 60_000 });
    const res = await app.request('/', { headers: { authorization: 'Bearer t' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const reader = res.body!.getReader();
    await readUntil(reader, ': connected');
    expect(feed.size()).toBe(1);

    feed.dispatch(input('grocery', 'delete'));
    const text = await readUntil(reader, '\n\n');
    expect(text).toContain('event: change');
    expect(text).toContain('data: {"resource":"grocery","event":"delete"}');
    expect(text).not.toContain('secret');

    await reader.cancel();
    expect(feed.size()).toBe(0);
  });

  test('closes the stream once the token stops validating', async () => {
    const feed = createChangeFeed();
    let valid = true;
    const auth: AuthFn = async (req) => (valid ? authed(req) : null);
    const app = makeEventsRoute(feed, { auth, heartbeatMs: 10 });
    const res = await app.request('/', { headers: { authorization: 'Bearer t' } });
    const reader = res.body!.getReader();
    await readUntil(reader, ': connected');

    valid = false;
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(feed.size()).toBe(0);
  });
});
