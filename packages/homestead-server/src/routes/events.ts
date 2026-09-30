/**
 * `GET /api/events` — a Server-Sent Events stream of collection changes.
 *
 * Each committed create/update/delete becomes one `change` event naming the
 * resource singular (see change-feed.ts for why that's all it carries). The
 * SPA turns an event into a query invalidation, so the list on someone else's
 * phone refetches — through the normal ACL-checked endpoints — a moment after
 * the write instead of on the next poll.
 *
 * The caller authenticates with the same bearer token as every other `/api`
 * call; the SPA reads the stream with `fetch` (EventSource can't send an
 * Authorization header). The token is re-checked on every heartbeat, so a
 * logout or revocation ends the stream within one interval rather than leaving
 * it open for the life of the tab.
 */

import { Hono } from 'hono';
import { authenticate, type AuthResult } from '@rambleraptor/homestead-core/server/aepbase';
import type { ChangeFeed } from '../change-feed';

export type AuthFn = (request: Request) => Promise<AuthResult | null>;

/** Comment-line keepalive so proxies don't reap an idle stream. */
export const HEARTBEAT_MS = 25_000;

export interface EventsRouteOptions {
  auth?: AuthFn;
  heartbeatMs?: number;
}

export function makeEventsRoute(feed: ChangeFeed, opts: EventsRouteOptions = {}): Hono {
  const auth = opts.auth ?? authenticate;
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const app = new Hono();

  app.get('/', async (c) => {
    const authed = await auth(c.req.raw);
    if (!authed) return c.json({ error: { code: 401, message: 'unauthorized' } }, 401);

    // A header-only re-check request, so the heartbeat can re-validate the
    // token without holding on to the original request object.
    const recheck = new Request(c.req.url, {
      headers: { authorization: `Bearer ${authed.token}` },
    });

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };

        const unsubscribe = feed.subscribe((event) => {
          send(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
        });

        const heartbeat = setInterval(() => {
          void auth(recheck).then((still) => {
            if (!still) {
              cleanup();
              try {
                controller.close();
              } catch {
                // already closed by the client
              }
              return;
            }
            send(': keepalive\n\n');
          });
        }, heartbeatMs);

        cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
        };

        // Tell the client how long to wait before reconnecting, and give it a
        // first byte so it knows the stream is live.
        send('retry: 5000\n: connected\n\n');
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Disable proxy buffering (nginx) so events arrive as they're sent.
        'X-Accel-Buffering': 'no',
      },
    });
  });

  return app;
}
