/**
 * React to changes other people make.
 *
 * The change feed (changeFeed.ts) already keeps every app's cached data
 * current, with no app code. These hooks are for the other half of working
 * with someone else: *noticing* what they did. "Sam checked off Milk", the row
 * Sam just touched lighting up, an open edit form learning that Sam saved the
 * same recipe a moment ago.
 *
 * Every change seen here came from somewhere other than this tab — this tab's
 * own writes are dropped before they reach these listeners. A change from the
 * same person on another device still arrives, flagged `byMe`; the hooks that
 * are about *other people* (highlights, toasts) skip those unless asked.
 *
 * - {@link useResourceEvents} — the primitive: a callback per change.
 * - {@link useRecentRemoteChanges} — which records were just changed, for a
 *   brief highlight (pair with `remoteChangeClass` / `RemoteChangeBadge`).
 * - {@link useChangeToasts} — a toast per change, bursts collapsed into one.
 * - {@link useRemoteEdits} — whether the record an open form is editing was
 *   saved or deleted elsewhere (pair with `RemoteEditNotice`).
 */

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { authStore } from './aepbase';
import { useToast } from '../shared/components/ToastProvider';
import type { ResourceEventData, ResourceEventType } from './resourceEvents';

export type RemoteChangeKind = 'created' | 'updated' | 'deleted';

type AnyRecord = Record<string, unknown>;

export interface RemoteChange<T = AnyRecord> {
  kind: RemoteChangeKind;
  /** Resource singular, e.g. `grocery`. */
  resource: string;
  id: string;
  /** AEP path, including parents: `credit-cards/1/perks/2`. */
  path: string;
  /** The record after the change. Absent on `deleted`. */
  record?: T;
  /**
   * The record as this tab had it just before the change, when it had it
   * cached — compare against `record` to tell *what* changed, or read a
   * deleted record's name from it. A list hook that maps its rows hands back
   * the mapped shape.
   */
  previous?: T;
  /** `users/<id>` of whoever made the change. */
  actor: string | null;
  /** Their display name, when they have one. See {@link actorLabel}. */
  actorName: string | null;
  /** Made by the signed-in user, on another device or tab. */
  byMe: boolean;
  /** When the server committed it (RFC 3339). */
  time: string;
}

type Listener = (change: RemoteChange) => void;

const listeners = new Set<Listener>();

const KINDS: Record<ResourceEventType, RemoteChangeKind> = {
  'resource.created': 'created',
  'resource.updated': 'updated',
  'resource.deleted': 'deleted',
};

/**
 * Hand one feed event to every listener. Called by the change feed after the
 * event has been written into the cache, so a listener that re-renders reads
 * the new state.
 */
export function publishRemoteChange(
  type: ResourceEventType,
  data: ResourceEventData,
  previous?: AnyRecord,
): void {
  if (listeners.size === 0) return;
  const me = authStore.model?.id;
  const change: RemoteChange = {
    kind: KINDS[type],
    resource: data.resource,
    id: data.id,
    path: data.path,
    record: data.record,
    previous,
    actor: data.actor,
    actorName: data.actor_name || null,
    byMe: !!me && data.actor === `users/${me}`,
    time: data.update_time,
  };
  for (const listener of listeners) {
    try {
      listener(change);
    } catch {
      // One app's handler failing must not starve the others.
    }
  }
}

/** Subscribe outside React. Returns an unsubscribe. */
export function subscribeRemoteChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Who made a change, for display: their name, "You", or "Someone". */
export function actorLabel(change: Pick<RemoteChange, 'actorName' | 'byMe'>): string {
  if (change.byMe) return 'You';
  return change.actorName || 'Someone';
}

type ResourceFilter = string | readonly string[];

function matchesResource(filter: ResourceFilter, resource: string): boolean {
  return typeof filter === 'string' ? filter === resource : filter.includes(resource);
}

export interface ResourceEventsOptions {
  /** Stop listening without unmounting. Defaults to true. */
  enabled?: boolean;
}

/**
 * Call `handler` for every change to `resource` (a singular, or several) that
 * didn't come from this tab. The handler may change between renders; the
 * latest one is always called.
 *
 * @example
 *   useResourceEvents<Grocery>('grocery', (change) => {
 *     if (change.kind === 'created' && !change.byMe) playChime();
 *   });
 */
export function useResourceEvents<T = AnyRecord>(
  resource: ResourceFilter,
  handler: (change: RemoteChange<T>) => void,
  options: ResourceEventsOptions = {},
): void {
  const { enabled = true } = options;
  const onChange = useEffectEvent((change: RemoteChange) => {
    if (matchesResource(resource, change.resource)) handler(change as RemoteChange<T>);
  });

  useEffect(() => {
    if (!enabled) return;
    return subscribeRemoteChanges((change) => onChange(change));
  }, [enabled]);
}

/** How long a changed row stays highlighted. */
export const RECENT_CHANGE_MS = 4_000;

export interface RecentRemoteChangesOptions {
  /** How long a change stays "recent". Defaults to {@link RECENT_CHANGE_MS}. */
  durationMs?: number;
  /** Include the signed-in user's changes from other devices. Defaults to false. */
  includeMine?: boolean;
}

/**
 * The records someone else changed in the last few seconds, by id — the
 * latest change to each. Subscribe once for a whole list and look rows up in
 * the map, the way `usePendingSyncIds` is used.
 *
 * @example
 *   const recent = useRecentRemoteChanges('grocery');
 *   <div className={cn('…', remoteChangeClass(recent.get(item.id)))}>
 *     {item.name}
 *     <RemoteChangeBadge change={recent.get(item.id)} />
 *   </div>
 */
export function useRecentRemoteChanges<T = AnyRecord>(
  resource: ResourceFilter,
  options: RecentRemoteChangesOptions = {},
): ReadonlyMap<string, RemoteChange<T>> {
  const { durationMs = RECENT_CHANGE_MS, includeMine = false } = options;
  const [recent, setRecent] = useState<ReadonlyMap<string, RemoteChange<T>>>(() => new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  useResourceEvents<T>(resource, (change) => {
    if (change.byMe && !includeMine) return;
    setRecent((prev) => new Map(prev).set(change.id, change));
    const existing = timers.current.get(change.id);
    if (existing) clearTimeout(existing);
    timers.current.set(
      change.id,
      setTimeout(() => {
        timers.current.delete(change.id);
        setRecent((prev) => {
          const next = new Map(prev);
          next.delete(change.id);
          return next;
        });
      }, durationMs),
    );
  });

  return recent;
}

/** Window in which a burst of changes collapses into one toast. */
export const CHANGE_TOAST_WINDOW_MS = 1_500;

export interface ChangeToastsOptions<T> {
  /**
   * The toast for a burst of more than one change. Defaults to
   * "Sam made 3 changes" (or "3 changes from others" across several people).
   * Return null to show nothing.
   */
  summarize?: (changes: RemoteChange<T>[]) => string | null;
  /** Include the signed-in user's changes from other devices. Defaults to false. */
  includeMine?: boolean;
  /** Stop toasting without unmounting. Defaults to true. */
  enabled?: boolean;
}

function defaultSummary(changes: RemoteChange[]): string {
  const who = new Set(changes.map(actorLabel));
  if (who.size === 1) return `${[...who][0]} made ${changes.length} changes`;
  return `${changes.length} changes from others`;
}

/**
 * Show a toast when someone else changes `resource`. `describe` writes the
 * message for one change ("Sam checked off Milk") or returns null to skip it.
 * Changes arriving together — a bulk clear, or a reconnect replaying what was
 * missed — become one toast via `summarize`.
 *
 * Mount it on the page that shows the data: the toasts are a narration of what
 * the person is looking at, not a notification system.
 */
export function useChangeToasts<T = AnyRecord>(
  resource: ResourceFilter,
  describe: (change: RemoteChange<T>) => string | null,
  options: ChangeToastsOptions<T> = {},
): void {
  const { includeMine = false, enabled = true, summarize } = options;
  const toast = useToast();
  const batch = useRef<RemoteChange<T>[]>([]);
  const messages = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset fully, not just the timer: a StrictMode remount reuses these refs,
  // and a stale handle would stop every later toast from being scheduled.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      batch.current = [];
      messages.current = [];
    },
    [],
  );

  useResourceEvents<T>(
    resource,
    (change) => {
      if (change.byMe && !includeMine) return;
      const message = describe(change);
      if (!message) return;
      batch.current.push(change);
      messages.current.push(message);
      timer.current ??= setTimeout(() => {
        const changes = batch.current;
        const [first] = messages.current;
        batch.current = [];
        messages.current = [];
        timer.current = null;
        const text =
          changes.length === 1
            ? first
            : summarize
              ? summarize(changes)
              : defaultSummary(changes as RemoteChange[]);
        if (text) toast.info(text);
      }, CHANGE_TOAST_WINDOW_MS);
    },
    { enabled },
  );
}

export interface RemoteEdits<T> {
  /**
   * The latest save or delete of the record from elsewhere since the form
   * started watching, or null. Includes the signed-in user's other devices —
   * a stale form is stale whoever saved over it.
   */
  change: RemoteChange<T> | null;
  /** Acknowledge it (after reloading, or choosing to keep editing). */
  dismiss: () => void;
}

/**
 * Watch one record while it's being edited, so the form can say "Sam saved
 * this while you were editing" instead of silently writing over Sam's change.
 * Pass `enabled: false` while no form is open; re-enabling starts clean.
 *
 * @example
 *   const remote = useRemoteEdits<Recipe>('recipe', recipeId, { enabled: isEditing });
 *   {remote.change && <RemoteEditNotice change={remote.change} onReload={…} onDismiss={remote.dismiss} />}
 */
export function useRemoteEdits<T = AnyRecord>(
  resource: string,
  id: string | null | undefined,
  options: { enabled?: boolean } = {},
): RemoteEdits<T> {
  const enabled = (options.enabled ?? true) && !!id;
  const [change, setChange] = useState<RemoteChange<T> | null>(null);

  // A different record, or a form that closed, starts clean.
  const watching = enabled ? id : null;
  const [watched, setWatched] = useState(watching);
  if (watched !== watching) {
    setWatched(watching);
    setChange(null);
  }

  useResourceEvents<T>(
    resource,
    (next) => {
      if (next.id === id && next.kind !== 'created') setChange(next);
    },
    { enabled },
  );

  const dismiss = useCallback(() => setChange(null), []);
  return { change, dismiss };
}
