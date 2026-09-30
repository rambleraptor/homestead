/**
 * Treat "the request never reached the server" as being offline.
 *
 * React Query's `onlineManager` only knows what the browser reports, and the
 * browser reports online whenever there's a network interface up. In a shop
 * that means store wifi with no internet behind it, or one bar of signal:
 * `navigator.onLine` is true, every fetch fails, and each write — which would
 * have queued happily had the browser admitted to being offline — instead
 * fails, rolls back its optimistic change, and toasts an error. The item the
 * user just checked off un-checks itself.
 *
 * So a failed fetch is taken as evidence: {@link reportNetworkFailure} flips
 * the manager offline, which pauses the failing mutation into the persisted
 * queue (see the `retry` defaults in queryClient.ts) and shows the offline
 * banner. A probe then polls a cheap public endpoint and flips the manager
 * back online once the server answers, which resumes the queue. The browser's
 * own `online`/`offline` events keep working alongside.
 */

import { onlineManager } from '@tanstack/react-query';

/** Cheap, unauthenticated, uncached — reachable iff the server is. */
export const PROBE_URL = '/api/app-version';
const MIN_PROBE_MS = 2_000;
const MAX_PROBE_MS = 15_000;

/**
 * A request that never got an HTTP response (DNS failure, refused or reset
 * connection, dropped link). An HTTP error status is an answer, not this.
 *
 * `fetch` signals these as a bare TypeError — the same type a plain bug throws
 * — so {@link fetchOrNetworkError} rewraps them at the call site, and only
 * this class counts as "offline". Otherwise a mutation with a typo in it
 * would look like a dead connection and retry forever.
 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof NetworkError;
}

/** `fetch`, with a failure to get any response rethrown as {@link NetworkError}. */
export async function fetchOrNetworkError(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    // An abort is the caller's decision, not a connectivity signal.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError(error);
  }
}

let probeTimer: ReturnType<typeof setTimeout> | null = null;

async function probeOnce(): Promise<boolean> {
  try {
    const res = await fetch(PROBE_URL, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

function scheduleProbe(delay: number): void {
  probeTimer = setTimeout(async () => {
    probeTimer = null;
    // The browser's own `online` event may have beaten us to it, and a
    // browser that reports offline will fire that event when it recovers.
    if (onlineManager.isOnline()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (await probeOnce()) {
      onlineManager.setOnline(true);
      return;
    }
    scheduleProbe(Math.min(delay * 2, MAX_PROBE_MS));
  }, delay);
}

/** Record that a request failed to reach the server; see the module doc. */
export function reportNetworkFailure(): void {
  if (onlineManager.isOnline()) onlineManager.setOnline(false);
  if (!probeTimer) scheduleProbe(MIN_PROBE_MS);
}

/** Stop any running probe. Test-only. */
export function resetConnectivityProbe(): void {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = null;
}
