/**
 * In-process change feed — tells open SPA tabs that a collection changed so a
 * list two people edit at once (the household grocery list) refreshes on the
 * other device within a moment instead of on the next poll.
 *
 * The feed rides the same post-commit seam as resource syncs: the engine calls
 * `dispatch` after a create/update/delete has durably committed, and
 * {@link teeDispatcher} fans that one call out to both the sync dispatcher and
 * this feed. Publishing is synchronous and never throws, so a slow or broken
 * subscriber can't block or fail the write.
 *
 * Events carry only the resource singular and the kind of change — never the
 * record or its id. A subscriber reacts by re-reading through the ordinary,
 * ACL-enforced endpoints, so the feed discloses nothing beyond "something in
 * this collection changed", and resource names are already public via
 * `/aep-resource-definitions`.
 */

import type { SyncDispatcher, SyncDispatchInput } from './sync';

export interface ChangeEvent {
  resource: string;
  event: SyncDispatchInput['event'];
}

export type ChangeListener = (event: ChangeEvent) => void;

export interface ChangeFeed extends SyncDispatcher {
  /** Register a listener; returns its unsubscribe function. */
  subscribe(listener: ChangeListener): () => void;
  /** Number of live subscribers (tests / diagnostics). */
  size(): number;
}

export function createChangeFeed(): ChangeFeed {
  const listeners = new Set<ChangeListener>();
  return {
    dispatch(input) {
      const event: ChangeEvent = { resource: input.resource, event: input.event };
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // A subscriber's failure is its own; the write already committed.
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    size: () => listeners.size,
  };
}

/** Fan one post-commit dispatch out to several dispatchers. */
export function teeDispatcher(...targets: SyncDispatcher[]): SyncDispatcher {
  return {
    dispatch(input) {
      for (const target of targets) target.dispatch(input);
    },
  };
}
