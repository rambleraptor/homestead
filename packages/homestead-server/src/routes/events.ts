/**
 * `GET /api/events` — Server-Sent Events stream of record changes.
 *
 * Public API; the full contract lives in docs/guides/events.md. In short:
 *
 *   Authorization: Bearer <token>        (required — same tokens as /api/aep)
 *   Last-Event-ID: <id>                  (optional — resume after this event)
 *   ?resources=grocery,store             (optional — narrow to these singulars)
 *
 *   event: stream.ready                  first frame, no id
 *   data: {"version":1,"resumed":true,"last_event_id":"<epoch>.<seq>"}
 *
 *   id: <epoch>.<seq>
 *   event: resource.created | resource.updated | resource.deleted
 *   data: {"resource","path","id","actor","origin","update_time","record"?}
 *
 * `resumed: false` on a reconnect means events were missed and could not be
 * replayed; the client must refetch whatever it caches. Each event reaches
 * only callers allowed to read its record (see change-feed.ts). The token is
 * re-validated on every heartbeat, so logout or revocation ends the stream
 * within one interval.
 */

import { Hono } from 'hono';
import type { ChangeFeed, FeedEvent, Subscriber } from '../change-feed';
import type { User } from '../engine/types';

export const EVENT_STREAM_VERSION = 1;

/** Comment-line keepalive so proxies don't reap an idle stream. */
export const HEARTBEAT_MS = 25_000;

/** Upper bound on `?resources=` entries — a filter, not a query language. */
const MAX_RESOURCE_FILTERS = 100;

export type TokenAuthenticator = (token: string) => Promise<User | null>;

export interface EventsRouteOptions {
  heartbeatMs?: number;
}

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : '';
}

function resourceFilter(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]+$/.test(s))
    .slice(0, MAX_RESOURCE_FILTERS);
  return names.length > 0 ? new Set(names) : null;
}

export function frameEvent(event: FeedEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function makeEventsRoute(
  feed: ChangeFeed,
  authenticate: TokenAuthenticator,
  opts: EventsRouteOptions = {},
): Hono {
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const app = new Hono();

  app.get('/', async (c) => {
    const token = bearerToken(c.req.raw);
    const caller = token ? await authenticate(token) : null;
    if (!caller) {
      return c.json({ error: { code: 401, message: 'missing or invalid bearer token' } }, 401);
    }
    const resources = resourceFilter(c.req.query('resources'));
    const lastEventId = c.req.header('last-event-id') ?? null;

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };

        const subscriber: Subscriber = {
          caller,
          resources,
          send: (event) => write(frameEvent(event)),
        };
        const subscription = feed.subscribe(subscriber, lastEventId);

        const end = () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        };

        const heartbeat = setInterval(() => {
          void authenticate(token).then((still) => {
            if (!still || !subscription.updateCaller(still)) return end();
            write(': keepalive\n\n');
          }, end);
        }, heartbeatMs);

        cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          subscription.close();
        };

        const ready = {
          version: EVENT_STREAM_VERSION,
          resumed: subscription.resumed,
          last_event_id: subscription.headId,
        };
        write(`retry: 5000\nevent: stream.ready\ndata: ${JSON.stringify(ready)}\n\n`);
        for (const event of subscription.replay) write(frameEvent(event));
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
