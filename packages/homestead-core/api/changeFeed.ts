/**
 * Client for the server's `/api/events` change feed.
 *
 * A write on one device becomes a `change` event (naming only the resource
 * singular) on every other open tab, which invalidates the owning app's
 * queries so a shared list — the grocery list two people are shopping from —
 * refetches within a moment instead of on the next poll. `useLiveRefresh`
 * keeps polling as a safety net, just much less often while this is connected.
 *
 * The stream is read with `fetch` rather than `EventSource` because the engine
 * authenticates with a bearer header, which EventSource can't send.
 *
 * Invalidation rules:
 *
 * - While a mutation for the app is in flight (or queued), the event is
 *   dropped: that mutation invalidates the app when it settles, and a refetch
 *   now could land before our own write and flicker the optimistic row back.
 *   This also swallows the echo of the user's own writes.
 * - Events are coalesced per app, so clearing ten checked items refetches the
 *   list once, not ten times.
 * - After a reconnect every app query is invalidated, since any events sent
 *   while the stream was down were missed.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { authStore, refreshSession } from './aepbase';
import { queryKeys } from './queryClient';
import { appIdsForResource } from './registerResourceMutationDefaults';

export const CHANGE_FEED_URL = '/api/events';

/** Window in which bursts of events for one app collapse into one refetch. */
export const COALESCE_MS = 250;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

// --- connected flag (read by useLiveRefresh) --------------------------------

let connected = false;
const statusListeners = new Set<() => void>();

function setConnected(next: boolean): void {
  if (connected === next) return;
  connected = next;
  for (const listener of statusListeners) listener();
}

/** Whether the change feed stream is currently open. */
export function isChangeFeedConnected(): boolean {
  return connected;
}

export function useChangeFeedConnected(): boolean {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    isChangeFeedConnected,
    () => false,
  );
}

// --- SSE framing ------------------------------------------------------------

export interface ChangeEvent {
  resource: string;
  event: string;
}

/**
 * Split a buffer into complete SSE frames. Returns the parsed `change` events
 * and the unconsumed tail (a frame still being received).
 */
export function parseFrames(buffer: string): { events: ChangeEvent[]; rest: string } {
  const frames = buffer.split(/\r?\n\r?\n/);
  const rest = frames.pop() ?? '';
  const events: ChangeEvent[] = [];
  for (const frame of frames) {
    let name = 'message';
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (name !== 'change' || data.length === 0) continue;
    try {
      const parsed = JSON.parse(data.join('\n')) as Partial<ChangeEvent>;
      if (typeof parsed.resource === 'string') {
        events.push({ resource: parsed.resource, event: String(parsed.event ?? '') });
      }
    } catch {
      // malformed frame — ignore it, the next poll catches up
    }
  }
  return { events, rest };
}

// --- connection manager -----------------------------------------------------

export interface ChangeFeedDeps {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  getToken: () => string;
  /**
   * Renew the session if it's near expiry (or unconditionally with `force`,
   * after a 401). Resolves true when a usable token is available.
   */
  refresh: (force: boolean) => Promise<boolean>;
  isOnline: () => boolean;
  /** Subscribe to online/offline flips; returns an unsubscribe. */
  onOnlineChange: (listener: (online: boolean) => void) => () => void;
  /** Whether the page is visible (a hidden tab drops the stream). */
  isVisible: () => boolean;
  onVisibilityChange: (listener: () => void) => () => void;
}

const defaultDeps: ChangeFeedDeps = {
  fetch: (input, init) => fetch(input, init),
  getToken: () => authStore.token,
  refresh: (force) =>
    force || authStore.needsRenewal ? refreshSession() : Promise.resolve(true),
  isOnline: () => onlineManager.isOnline(),
  onOnlineChange: (listener) => onlineManager.subscribe(listener),
  isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  onVisibilityChange: (listener) => {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

/** Invalidate an app's queries for one change event, per the rules above. */
function makeInvalidator(qc: QueryClient) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const onChange = (event: ChangeEvent) => {
    for (const appId of appIdsForResource(event.resource)) {
      if (timers.has(appId)) continue;
      timers.set(
        appId,
        setTimeout(() => {
          timers.delete(appId);
          if (qc.isMutating({ mutationKey: ['app', appId] }) > 0) return;
          void qc.invalidateQueries({ queryKey: queryKeys.app(appId).all() });
        }, COALESCE_MS),
      );
    }
  };

  const cancel = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };

  return { onChange, cancel };
}

/**
 * Hold the change feed open until the returned function is called:
 * reconnecting with backoff, pausing while offline or hidden, and invalidating
 * the owning app's queries on each event.
 */
export function connectChangeFeed(
  qc: QueryClient,
  deps: ChangeFeedDeps = defaultDeps,
): () => void {
  const invalidator = makeInvalidator(qc);
  let stopped = false;
  let abort: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = MIN_BACKOFF_MS;
  let hasConnectedBefore = false;
  let running = false;

  const canRun = () => !stopped && deps.isOnline() && deps.isVisible();

  const scheduleRetry = () => {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void run();
    }, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };

  const open = async (signal: AbortSignal): Promise<Response> => {
    await deps.refresh(false);
    const send = () =>
      deps.fetch(CHANGE_FEED_URL, {
        headers: { Authorization: `Bearer ${deps.getToken()}`, Accept: 'text/event-stream' },
        signal,
        cache: 'no-store',
      });
    let res = await send();
    if (res.status === 401 && (await deps.refresh(true))) res = await send();
    return res;
  };

  const run = async () => {
    if (running || !canRun() || !deps.getToken()) return;
    running = true;
    abort = new AbortController();
    const { signal } = abort;
    try {
      const res = await open(signal);
      if (!res.ok || !res.body) throw new Error(`change feed: HTTP ${res.status}`);

      setConnected(true);
      backoff = MIN_BACKOFF_MS;
      // Whatever changed while we were disconnected never reached us.
      if (hasConnectedBefore) void qc.invalidateQueries({ queryKey: ['app'] });
      hasConnectedBefore = true;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseFrames(buffer);
        buffer = rest;
        for (const event of events) invalidator.onChange(event);
      }
    } catch {
      // Network drop, abort, or server refusal — handled by the retry below.
    } finally {
      running = false;
      abort = null;
      setConnected(false);
    }
    if (canRun()) scheduleRetry();
  };

  const disconnect = () => {
    abort?.abort();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const reconsider = () => {
    if (canRun()) {
      backoff = MIN_BACKOFF_MS;
      void run();
    } else {
      disconnect();
    }
  };

  const offOnline = deps.onOnlineChange(reconsider);
  const offVisibility = deps.onVisibilityChange(reconsider);
  void run();

  return () => {
    stopped = true;
    offOnline();
    offVisibility();
    disconnect();
    invalidator.cancel();
    setConnected(false);
  };
}

/**
 * Keep the change feed open for as long as the component is mounted and
 * `enabled` (pass whether someone is signed in).
 */
export function useChangeFeed(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return connectChangeFeed(qc);
  }, [qc, enabled]);
}
