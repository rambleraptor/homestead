/**
 * Client for the server's `/api/events` change feed (contract:
 * docs/guides/events.md).
 *
 * Another device's write arrives as a `resource.*` event carrying the changed
 * record, which is written straight into the cache (see resourceEvents.ts) —
 * so the grocery list two people are shopping from updates within a moment,
 * with no request. `useLiveRefresh` keeps polling as a slow safety net.
 *
 * The stream is read with `fetch` rather than `EventSource` because the engine
 * authenticates with a bearer header, which EventSource can't send.
 *
 * - **Own writes** come back with `origin` set to this tab's client id and are
 *   skipped: the mutation already put them in the cache.
 * - **Resume**: the last event id is sent as `Last-Event-ID` on reconnect, and
 *   the server replays what was missed. Only when it answers `resumed: false`
 *   (a restart, or a long absence) is every app query refetched.
 * - **Fallback**: an event that can't be written into the cache directly (the
 *   list is filtered, or its hook didn't register its shape) invalidates the
 *   owning app instead — coalesced per app, and skipped while that app has
 *   writes in flight, since their settle invalidates anyway. A patched event
 *   still invalidates the app's *other* queries (widgets, derived views), just
 *   not the slots it already brought up to date.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { authStore, refreshSession } from './aepbase';
import { queryKeys } from './queryClient';
import { appIdsForResource } from './registerResourceMutationDefaults';
import { getClientId } from './clientId';
import {
  applyResourceEvent,
  isResourceEventType,
  type ResourceEventData,
  type ResourceEventType,
} from './resourceEvents';

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

export interface SseFrame {
  id?: string;
  event: string;
  data?: unknown;
}

/**
 * Split a buffer into complete SSE frames. Returns the parsed frames and the
 * unconsumed tail (a frame still being received). Comment-only frames
 * (keepalives) and frames with unparseable data are dropped.
 */
export function parseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const chunks = buffer.split(/\r?\n\r?\n/);
  const rest = chunks.pop() ?? '';
  const frames: SseFrame[] = [];
  for (const chunk of chunks) {
    let event = '';
    let id: string | undefined;
    const data: string[] = [];
    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('id:')) id = line.slice(3).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!event) continue;
    const frame: SseFrame = { event };
    if (id !== undefined) frame.id = id;
    if (data.length > 0) {
      try {
        frame.data = JSON.parse(data.join('\n'));
      } catch {
        continue; // malformed — the safety-net poll catches up
      }
    }
    frames.push(frame);
  }
  return { frames, rest };
}

interface StreamReady {
  version: number;
  resumed: boolean;
  last_event_id: string;
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

/**
 * Coalesced per-app invalidation. `except` names resource singulars whose
 * slots an event already patched; a later unpatched event for the same app in
 * the same window widens it back to the whole app.
 */
function makeInvalidator(qc: QueryClient) {
  const pending = new Map<string, { all: boolean; except: Set<string> }>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const flush = (appId: string) => {
    timers.delete(appId);
    const job = pending.get(appId);
    pending.delete(appId);
    if (!job) return;
    if (qc.isMutating({ mutationKey: ['app', appId] }) > 0) return;
    void qc.invalidateQueries({
      queryKey: queryKeys.app(appId).all(),
      predicate: job.all ? undefined : (q) => !job.except.has(String(q.queryKey[2])),
    });
  };

  const schedule = (appId: string, patchedResource: string | null) => {
    const job = pending.get(appId) ?? { all: false, except: new Set<string>() };
    if (patchedResource === null) job.all = true;
    else job.except.add(patchedResource);
    pending.set(appId, job);
    if (!timers.has(appId)) timers.set(appId, setTimeout(() => flush(appId), COALESCE_MS));
  };

  const cancel = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    pending.clear();
  };

  return { schedule, cancel };
}

/**
 * Hold the change feed open until the returned function is called:
 * reconnecting (and resuming) with backoff, pausing while offline or hidden,
 * and applying each event to the cache.
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
  let lastEventId: string | null = null;
  let hasConnectedBefore = false;
  let running = false;

  const onResourceEvent = (type: ResourceEventType, data: ResourceEventData) => {
    if (data.origin && data.origin === getClientId()) return;
    for (const appId of appIdsForResource(data.resource)) {
      const patched = applyResourceEvent(qc, appId, type, data);
      invalidator.schedule(appId, patched ? data.resource : null);
    }
  };

  const onFrame = (frame: SseFrame) => {
    if (frame.id) lastEventId = frame.id;
    if (frame.event === 'stream.ready') {
      const ready = frame.data as Partial<StreamReady> | undefined;
      setConnected(true);
      if (!ready?.resumed) {
        // Events were missed and can't be replayed: refetch what's cached.
        if (hasConnectedBefore) void qc.invalidateQueries({ queryKey: ['app'] });
        if (typeof ready?.last_event_id === 'string') lastEventId = ready.last_event_id;
      }
      hasConnectedBefore = true;
      return;
    }
    if (isResourceEventType(frame.event) && frame.data && typeof frame.data === 'object') {
      const data = frame.data as ResourceEventData;
      if (typeof data.resource === 'string' && typeof data.id === 'string') {
        onResourceEvent(frame.event, data);
      }
    }
    // Unknown event types are ignored, so the server can add them freely.
  };

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
    const send = () => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${deps.getToken()}`,
        Accept: 'text/event-stream',
      };
      if (lastEventId) headers['Last-Event-ID'] = lastEventId;
      return deps.fetch(CHANGE_FEED_URL, { headers, signal, cache: 'no-store' });
    };
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

      backoff = MIN_BACKOFF_MS;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = parseFrames(buffer);
        buffer = rest;
        for (const frame of frames) onFrame(frame);
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
