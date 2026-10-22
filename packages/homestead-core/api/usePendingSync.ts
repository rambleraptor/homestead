/**
 * Which records are still waiting to reach the server.
 *
 * Every write in the app is optimistic: `registerResourceMutationDefaults`
 * writes the new state into the cache immediately and reconciles later. That's
 * the right behaviour — the UI shouldn't stall on the network — but it leaves
 * the interface unable to distinguish a record the server has accepted from
 * one sitting in a queue on a phone with no signal. Both render identically,
 * so adding a grocery item in a shop looks exactly like saving it did.
 *
 * These hooks recover that distinction so the UI can show it.
 *
 * Only *paused* mutations count. React Query marks a mutation `pending` for
 * the entire round trip, so gating on `pending` alone would flash an
 * indicator on every ordinary online write — a few hundred milliseconds of
 * flicker on something the user has no reason to think about. `isPaused` is
 * the narrower and more meaningful state: the queue has this write and is
 * waiting for connectivity to send it. That's the case worth surfacing,
 * because it's the one where "saved" isn't yet true.
 */

import { useMutationState } from '@tanstack/react-query';
import { useOnlineStatus } from '../shared/hooks/useOnlineStatus';
import { isTempId } from './registerResourceMutationDefaults';

/**
 * The record id a mutation's variables refer to.
 *
 * The three mutation shapes registered per resource each carry their target
 * differently: a create names the optimistic record by `tempId`, an update
 * uses `{ id, data }`, and a delete is either a bare id string or
 * `{ id, parent }`. `tempId` is checked first — a create's variables can also
 * carry an `id` field belonging to something else entirely (a grocery item's
 * `store`, say, is not the record being created).
 */
export function affectedRecordId(variables: unknown): string | undefined {
  if (typeof variables === 'string') return variables;
  if (!variables || typeof variables !== 'object') return undefined;
  const vars = variables as { tempId?: unknown; id?: unknown };
  if (typeof vars.tempId === 'string') return vars.tempId;
  if (typeof vars.id === 'string') return vars.id;
  return undefined;
}

/**
 * Ids of every record with a write queued for reconnect.
 *
 * Prefer this in a list: it subscribes to the mutation cache once for the
 * whole list rather than once per row.
 */
export function usePendingSyncIds(): ReadonlySet<string> {
  const queued = useMutationState({
    filters: { status: 'pending' },
    select: (mutation) =>
      mutation.state.isPaused
        ? affectedRecordId(mutation.state.variables)
        : undefined,
  });

  // Built fresh rather than memoised. The Set is only ever read through
  // `.has()` during render, so its identity doesn't matter to callers, and
  // keying a memo on the joined ids would mean picking a separator that no
  // record id could ever contain — an assumption with no way to fail loudly.
  return new Set(
    queued.filter((id): id is string => typeof id === 'string'),
  );
}

/**
 * Whether one record is waiting to sync.
 *
 * The temp-id clause is a safety net for the reload case. A record created
 * offline keeps its `tmp_` id in the persisted cache, and if the rehydrated
 * mutation hasn't re-entered the cache as paused yet, the id alone still
 * proves the server has never seen this record. Guarded on being offline so a
 * normal online create — which also holds a temp id, but only until the
 * response lands — doesn't flicker.
 */
export function usePendingSync(id: string): boolean {
  const pendingIds = usePendingSyncIds();
  const { isOffline } = useOnlineStatus();
  return pendingIds.has(id) || (isOffline && isTempId(id));
}

/**
 * Whether *any* write is waiting for connectivity.
 *
 * Same `isPaused` discrimination as {@link usePendingSyncIds}, but without
 * naming the records. A caller that only needs "is the queue empty?" — a
 * background poll deciding whether to hold off, say — shouldn't have to rely
 * on every mutation's variables being id-shaped.
 */
export function useHasQueuedWrites(): boolean {
  const paused = useMutationState({
    filters: { status: 'pending' },
    select: (mutation) => mutation.state.isPaused,
  });
  return paused.some(Boolean);
}
