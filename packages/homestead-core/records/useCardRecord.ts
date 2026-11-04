/**
 * The live record behind a record card.
 *
 * A card is handed a point-in-time copy (a tool result, a change event) that
 * may be days old by the time it renders, or a capped preview that isn't a
 * record at all. So the card reads the record by id, through the same cache
 * slot the app's own screens use (`useResourceItem`): an edit made here or on
 * the app's page shows on both, the change feed keeps it current when someone
 * else changes it, and a record that's gone reads as deleted rather than as
 * whatever the copy said.
 */

import { useState } from 'react';
import { AepbaseError } from '../api/aepbase';
import { useResourceItem, type ResourceItemOptions } from '../api/resourceHooks';
import { useResourceEvents } from '../api/remoteChanges';

export interface CardRecordOptions {
  /** The owning app's id: the cache namespace (`todos`). */
  appId: string;
  singular: string;
  plural: string;
  id: string;
  /** The copy the card was handed, shown until the live record arrives. */
  snapshot?: unknown;
  /** Parent chain for a nested resource (`['users', '<id>']`). */
  parent?: string[];
}

export interface CardRecord<T> {
  /** The record: live once loaded, the snapshot until then (when it is one). */
  record: T | undefined;
  /** The record no longer exists: a read said 404, or someone deleted it. */
  deleted: boolean;
  /** Nothing to show yet: no usable snapshot, and the read hasn't answered. */
  isPending: boolean;
  /** A read that failed for any reason other than the record being gone. */
  error: Error | null;
}

const isNotFound = (err: unknown): boolean => err instanceof AepbaseError && err.code === 404;

/** The snapshot, when it is this record and not a preview standing in for one. */
function asRecord<T>(snapshot: unknown, id: string): T | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  return (snapshot as { id?: unknown }).id === id ? (snapshot as T) : undefined;
}

export function useCardRecord<T extends { id: string }>({
  appId,
  singular,
  plural,
  id,
  snapshot,
  parent,
}: CardRecordOptions): CardRecord<T> {
  const placeholder = asRecord<T>(snapshot, id);
  const query = useResourceItem<T>(appId, singular, plural, id, {
    parent,
    // TanStack guards placeholder data against functions (`NonFunctionGuard`),
    // which a generic `T` can't be shown to satisfy; a record never is one.
    placeholderData: placeholder as ResourceItemOptions<T>['placeholderData'],
    // A record that's gone stays gone: no point asking twice.
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });

  // The change feed drops a deleted record's cache slot, but this card keeps
  // showing what it last had: so it hears the delete itself. Either kind of
  // "gone" lasts only until the record is back in the cache — restored here
  // (an undo, which the feed doesn't echo to this tab) or by someone else.
  const [removedAt, setRemovedAt] = useState<number | null>(null);
  useResourceEvents(singular, (change) => {
    if (change.id !== id) return;
    setRemovedAt(change.kind === 'deleted' ? Date.now() : null);
  });

  const removed = removedAt !== null && query.dataUpdatedAt <= removedAt;
  const notFound = isNotFound(query.error) && query.errorUpdatedAt >= query.dataUpdatedAt;
  const deleted = removed || notFound;
  return {
    record: query.data ?? placeholder,
    deleted,
    isPending: !query.data && !placeholder && query.isPending,
    error: deleted ? null : query.error,
  };
}
