/**
 * Apply a change-feed `resource.*` event straight to the React Query cache.
 *
 * Events carry the changed record, so the common case — someone else checks
 * off an item on a list this tab is showing — needs no request: the record is
 * written into the resource's convention list and detail slots
 * (`queryKeys.app(appId).resource(singular)`), the same slots the mutation
 * factory writes optimistic state to.
 *
 * A list slot holds what its read hook produced, not raw records: the hook may
 * map each record and sort the result. So a list is only patched when the hook
 * that fills it has registered that shape ({@link registerListShape}, called by
 * `useResourceList`) and the list is the whole collection — a filtered or
 * parent-scoped list can't tell whether a new record belongs in it. Anything
 * else falls back to invalidation, which the caller coalesces.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryClient';
import { affectedRecordId } from './usePendingSync';

export type ResourceEventType = 'resource.created' | 'resource.updated' | 'resource.deleted';

/** The `data` of a `resource.*` event (see docs/guides/events.md). */
export interface ResourceEventData {
  resource: string;
  path: string;
  id: string;
  actor: string | null;
  origin: string | null;
  update_time: string;
  record?: Record<string, unknown>;
}

export function isResourceEventType(name: string): name is ResourceEventType {
  return name === 'resource.created' || name === 'resource.updated' || name === 'resource.deleted';
}

interface ListShape {
  map?: (record: never) => unknown;
  comparator?: (a: never, b: never) => number;
  /** True when the list is the whole collection (no filter, no parent scope). */
  complete: boolean;
}

const listShapes = new Map<string, ListShape>();
const shapeKey = (appId: string, singular: string) => `${appId}:${singular}`;

/**
 * Declare how the convention list slot for `(appId, singular)` is built, so an
 * incoming record can be written into it in the same form. `useResourceList`
 * calls this on every render; the latest registration wins.
 */
export function registerListShape(appId: string, singular: string, shape: ListShape): void {
  listShapes.set(shapeKey(appId, singular), shape);
}

/** Reset registered shapes. Test-only. */
export function clearListShapes(): void {
  listShapes.clear();
}

/** Whether this tab has a write queued or in flight for the record. */
function hasPendingWrite(qc: QueryClient, id: string): boolean {
  return qc
    .getMutationCache()
    .getAll()
    .some((m) => m.state.status === 'pending' && affectedRecordId(m.state.variables) === id);
}

type Row = { id: string } & Record<string, unknown>;

/**
 * Write one event into `appId`'s cache. Returns true when the list and detail
 * slots now reflect it; false when the caller should invalidate instead.
 */
export function applyResourceEvent(
  qc: QueryClient,
  appId: string,
  type: ResourceEventType,
  data: ResourceEventData,
): boolean {
  // Our own edit to this record hasn't landed yet. Writing someone else's
  // version over the optimistic one would flicker it back; the mutation
  // settles moments from now and invalidates, which picks up both.
  if (hasPendingWrite(qc, data.id)) return false;

  const keys = queryKeys.app(appId).resource(data.resource);
  const shape = listShapes.get(shapeKey(appId, data.resource));
  const list = qc.getQueryData<Row[]>(keys.list());

  if (type === 'resource.deleted') {
    qc.removeQueries({ queryKey: keys.detail(data.id), exact: true });
    if (list) qc.setQueryData<Row[]>(keys.list(), list.filter((r) => r.id !== data.id));
    // Removing a row never needs the list's shape, so a delete is always
    // fully applied — even to a filtered list.
    return true;
  }

  if (!data.record) return false;
  const record = data.record as Row;

  if (qc.getQueryData(keys.detail(data.id)) !== undefined) {
    qc.setQueryData<Row>(keys.detail(data.id), (prev) => ({ ...(prev ?? {}), ...record }) as Row);
  }

  if (!list) return true; // nothing on screen to patch
  if (!shape?.complete) return false;

  const mapped = (shape.map ? shape.map(record as never) : record) as Row;
  const next = list.some((r) => r.id === data.id)
    ? list.map((r) => (r.id === data.id ? mapped : r))
    : [...list, mapped];
  if (shape.comparator) next.sort(shape.comparator as (a: Row, b: Row) => number);
  qc.setQueryData<Row[]>(keys.list(), next);
  return true;
}
