/**
 * Marks a record the server hasn't accepted yet.
 *
 * Pairs with `usePendingSync` — see that module for why "pending" here means
 * queued-for-reconnect rather than merely in flight.
 *
 * The badge is deliberately quiet. A record waiting to sync is not an error
 * and usually not even a problem; it's a fact the user should be able to find
 * if they go looking, not an alarm demanding they deal with it. Hence a small
 * muted chip rather than a warning colour.
 *
 * `pendingSyncClass` handles the other half: the row itself dims slightly
 * while queued, and transitions back to full strength when the write lands.
 * That fade is the whole point of the feature — it's the moment the app
 * confirms the thing is real, and it costs nothing because the row is already
 * re-rendering when the record reconciles.
 *
 * @example
 *   const pending = usePendingSync(item.id);
 *   <div className={cn('...', pendingSyncClass(pending))}>
 *     {item.name}
 *     {pending && <PendingSyncBadge />}
 *   </div>
 */

import { CloudOff } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { usePendingSyncCount } from '@rambleraptor/homestead-core/api/usePendingSync';

/**
 * Row styling for a record awaiting sync. Always include this (rather than
 * applying it conditionally) so the transition exists in both directions and
 * the row eases back to full opacity when the record syncs.
 */
export function pendingSyncClass(isPending: boolean): string {
  return cn(
    'transition-opacity duration-(--duration-settle) ease-out-soft',
    isPending && 'opacity-60',
  );
}

export function PendingSyncBadge({
  className,
  iconOnly = false,
}: {
  className?: string;
  /** Just the icon (with its screen-reader label), for a margin or a dense row. */
  iconOnly?: boolean;
}) {
  if (iconOnly) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center text-text-muted', className)}
        title="Waiting to sync"
        data-testid="pending-sync-badge"
      >
        <CloudOff className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">Waiting to sync</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 font-body text-xs text-text-muted',
        className,
      )}
      data-testid="pending-sync-badge"
    >
      <CloudOff className="h-3 w-3" aria-hidden="true" />
      {/*
        The icon alone would leave screen-reader users with no way to tell a
        queued record from a saved one, which is exactly the gap this feature
        exists to close.
      */}
      <span className="sr-only">Waiting to sync</span>
      <span aria-hidden="true">Unsynced</span>
    </span>
  );
}

/**
 * One quiet line saying how many of the person's changes are waiting for a
 * connection — "Offline · 3 changes will sync". Renders nothing when nothing
 * is waiting, so a screen can always include it.
 */
export function SyncStatus({
  collections,
  className,
}: {
  /** Which collections' changes to count (plurals). */
  collections: readonly string[];
  className?: string;
}) {
  const count = usePendingSyncCount(collections);
  if (count === 0) return null;
  return (
    <p
      role="status"
      className={cn('flex items-center gap-1.5 font-body text-xs text-text-muted', className)}
      data-testid="sync-status"
    >
      <CloudOff className="h-3 w-3" aria-hidden="true" />
      {count === 1 ? 'Offline · 1 change will sync' : `Offline · ${count} changes will sync`}
    </p>
  );
}
