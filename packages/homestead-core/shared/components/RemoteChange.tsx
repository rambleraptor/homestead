/**
 * The visible half of remoteChanges.ts: marking what someone else just did.
 *
 * - `remoteChangeClass` + `RemoteChangeBadge` light up a row another person
 *   just changed, then fade back — feed them from `useRecentRemoteChanges`.
 * - `RemoteEditNotice` tells an open edit form that its record was saved or
 *   deleted elsewhere — feed it from `useRemoteEdits`.
 *
 * Like `PendingSyncBadge`, these are deliberately quiet. Someone else editing
 * the shared list is normal, not an alarm; the highlight is there so the eye
 * lands on what moved, and it goes away on its own.
 *
 * @example
 *   const recent = useRecentRemoteChanges('grocery');
 *   const change = recent.get(item.id);
 *   <div className={cn('px-4 py-3', remoteChangeClass(change))}>
 *     {item.name}
 *     <RemoteChangeBadge change={change} />
 *   </div>
 */

import { RefreshCw, UserRound } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { actorLabel, type RemoteChange } from '../../api/remoteChanges';
import { Button } from './Button';

type ChangeLike = Pick<RemoteChange, 'actorName' | 'byMe'>;

/**
 * Row styling for a record someone else just changed. Always include it (not
 * conditionally) so the tint fades out rather than snapping off. Put it on an
 * element without an opaque background of its own, last in the class list: it
 * transitions both background and opacity, so it can share the element with
 * `pendingSyncClass`.
 */
export function remoteChangeClass(change: ChangeLike | undefined): string {
  return cn(
    'transition-[background-color,opacity] duration-(--duration-deliberate) ease-out-soft',
    change && 'bg-accent-terracotta/10',
  );
}

/** A small chip naming who just changed the row. Renders nothing without a change. */
export function RemoteChangeBadge({
  change,
  className,
}: {
  change: ChangeLike | undefined;
  className?: string;
}) {
  if (!change) return null;
  const who = actorLabel(change);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-terracotta/15 px-1.5 py-0.5 font-body text-xs text-brand-navy',
        className,
      )}
      data-testid="remote-change-badge"
    >
      <UserRound className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">Just changed by </span>
      {who}
    </span>
  );
}

interface RemoteEditNoticeProps {
  change: RemoteChange<unknown>;
  /** What the record is called in a sentence: "recipe", "event". */
  noun: string;
  /** Replace the form's values with the saved record. Omitted for a delete. */
  onReload?: () => void;
  /** Keep editing; a save will write over the other change. */
  onDismiss: () => void;
  className?: string;
}

/**
 * Shown above an edit form whose record changed elsewhere since it opened. The
 * form's values are older than what's saved; this lets the person pick up the
 * other change instead of unknowingly writing over it.
 */
export function RemoteEditNotice({
  change,
  noun,
  onReload,
  onDismiss,
  className,
}: RemoteEditNoticeProps) {
  const who = change.byMe ? 'You' : actorLabel(change);
  const where = change.byMe ? ' on another device' : '';
  const deleted = change.kind === 'deleted';

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-accent-terracotta/40 bg-accent-terracotta/10 p-4 font-body text-sm text-brand-navy sm:flex-row sm:items-center',
        className,
      )}
      data-testid="remote-edit-notice"
    >
      <p className="flex-1">
        {deleted
          ? `${who} deleted this ${noun}${where} while you were editing it.`
          : `${who} saved changes to this ${noun}${where} while you were editing it. Saving now will replace those changes.`}
      </p>
      <div className="flex shrink-0 gap-2">
        {!deleted && onReload && (
          <Button type="button" size="sm" onClick={onReload} data-testid="remote-edit-reload">
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Load saved version
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onDismiss}
          data-testid="remote-edit-dismiss"
        >
          {deleted ? 'OK' : 'Keep mine'}
        </Button>
      </div>
    </div>
  );
}
