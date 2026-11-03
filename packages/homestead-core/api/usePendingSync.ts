/**
 * Which records are still waiting to reach the server.
 *
 * Every write in the app is optimistic: the cache shows the change at once,
 * and the request waits in the outbox (`outbox.ts`) until the server has it.
 * That's the right behaviour — the UI shouldn't stall on the network — but it
 * leaves the interface unable to tell a record the server has accepted from
 * one sitting in a queue on a phone with no signal. Both render identically,
 * so adding a grocery item in a shop looks exactly like saving it did.
 *
 * These hooks recover that distinction from the outbox itself, so it holds
 * across reloads: the queue is saved on the device, and every entry names the
 * record it acts on (its AEP-122 resource name).
 *
 * Only a *parked* outbox counts — one waiting for a connection. While it's
 * sending online, a write is on its way, and flashing a badge for the few
 * hundred milliseconds that takes would be noise. Parked is the case worth
 * surfacing, because it's the one where "saved" isn't yet true.
 */

import { useSyncExternalStore } from 'react';
import { outbox as pageOutbox, parseResourceName, type Outbox } from './outbox';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * One cached snapshot per outbox, rebuilt only when the queue changes —
 * `useSyncExternalStore` needs the same object back while nothing has.
 */
const snapshots = new WeakMap<Outbox, { key: string; ids: ReadonlySet<string> }>();

function waitingIds(outbox: Outbox): ReadonlySet<string> {
  const ids = outbox.isParked()
    ? outbox.requests().map((r) => parseResourceName(r.name).id)
    : [];
  const key = ids.join('\n');
  const cached = snapshots.get(outbox);
  if (cached && cached.key === key) return cached.ids;
  const next = ids.length > 0 ? new Set(ids) : EMPTY;
  snapshots.set(outbox, { key, ids: next });
  return next;
}

/**
 * Ids of every record with a write waiting for a connection.
 *
 * Prefer this in a list: it subscribes to the outbox once for the whole list
 * rather than once per row.
 */
export function usePendingSyncIds(outbox: Outbox = pageOutbox): ReadonlySet<string> {
  return useSyncExternalStore(
    (onChange) => outbox.subscribe(onChange),
    () => waitingIds(outbox),
    () => EMPTY,
  );
}

/** Whether one record has a write waiting for a connection. */
export function usePendingSync(id: string, outbox: Outbox = pageOutbox): boolean {
  return usePendingSyncIds(outbox).has(id);
}

/**
 * Whether *any* write is waiting for a connection. A caller that only needs
 * "is the queue empty?" — a background poll deciding whether to hold off,
 * say — doesn't need to know which records.
 */
export function useHasQueuedWrites(outbox: Outbox = pageOutbox): boolean {
  return useSyncExternalStore(
    (onChange) => outbox.subscribe(onChange),
    () => outbox.isParked(),
    () => false,
  );
}
