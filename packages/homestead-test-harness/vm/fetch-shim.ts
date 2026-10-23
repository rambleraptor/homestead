/**
 * Routes every fetch in the worker — the SPA's relative `/api/*` calls and the
 * server's loopback calls to `${VM_ORIGIN}/api/aep` — into the active app's
 * fetch handler. Nothing leaves the process: a request for any other origin
 * throws, so a test can't quietly depend on the network.
 */

import { VM_ORIGIN } from './origin';

type Handler = (req: Request) => Response | Promise<Response>;

/** Requests that stay open by design (the SSE change feed) and never count as in flight. */
const LONG_LIVED_PATHS = new Set(['/api/events']);

let active: Handler | null = null;
let installed = false;
let inFlight = 0;

/** Requests the shim has handed to the app and not yet answered. */
export function inFlightRequests(): number {
  return inFlight;
}

export function setActiveHandler(handler: Handler | null): void {
  active = handler;
}

const abortError = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : new DOMException('This operation was aborted', 'AbortError');

/**
 * What a real fetch does on abort: reading the body rejects, and the server
 * side sees its stream cancelled. Handing the app's Response straight back
 * would skip both, leaving a streaming route (the change feed) running — its
 * heartbeat timer included — after the page that opened it is gone.
 */
function abortable(res: Response, signal: AbortSignal): Response {
  if (!res.body) return res;
  const source = res.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener(
        'abort',
        () => {
          controller.error(abortError(signal));
          void source.cancel(signal.reason).catch(() => {});
        },
        { once: true },
      );
    },
    async pull(controller) {
      try {
        const { done, value } = await source.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        if (!signal.aborted) controller.error(err);
      }
    },
    cancel(reason) {
      return source.cancel(reason);
    },
  });
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export function installFetchShim(): void {
  if (installed) return;
  installed = true;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const base = globalThis.location?.href ?? `${VM_ORIGIN}/`;
    const req =
      input instanceof Request && !init
        ? input
        : new Request(new URL(input instanceof Request ? input.url : String(input), base), init);
    const url = new URL(req.url);
    if (url.origin !== VM_ORIGIN) {
      throw new TypeError(`homestead VM: blocked network request to ${req.url}`);
    }
    if (!active) throw new TypeError(`homestead VM: no app booted for ${req.url}`);
    if (req.signal.aborted) throw abortError(req.signal);

    const counted = !LONG_LIVED_PATHS.has(url.pathname);
    if (counted) inFlight++;
    try {
      return abortable(await active(req), req.signal);
    } finally {
      if (counted) inFlight--;
    }
  };
}
