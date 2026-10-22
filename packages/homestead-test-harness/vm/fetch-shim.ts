/**
 * Routes every fetch in the worker — the SPA's relative `/api/*` calls and the
 * server's loopback calls to `${VM_ORIGIN}/api/aep` — into the active app's
 * fetch handler. Nothing leaves the process: a request for any other origin
 * throws, so a test can't quietly depend on the network.
 */

import { VM_ORIGIN } from './origin';

type Handler = (req: Request) => Response | Promise<Response>;

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

export function installFetchShim(): void {
  if (installed) return;
  installed = true;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const base = globalThis.location?.href ?? `${VM_ORIGIN}/`;
    const req =
      input instanceof Request && !init
        ? input
        : new Request(new URL(input instanceof Request ? input.url : String(input), base), init);
    if (new URL(req.url).origin !== VM_ORIGIN) {
      throw new TypeError(`homestead VM: blocked network request to ${req.url}`);
    }
    if (!active) throw new TypeError(`homestead VM: no app booted for ${req.url}`);
    inFlight++;
    try {
      return await active(req);
    } finally {
      inFlight--;
    }
  };
}
