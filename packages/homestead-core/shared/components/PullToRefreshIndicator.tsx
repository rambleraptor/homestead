/**
 * The disc that rides down with a pull-to-refresh gesture and spins while
 * the refresh runs. Rendered only while a pull is underway, so it's absent
 * from the tree (and from tests) the rest of the time.
 *
 * Position is a transform only, so following the finger composites; the
 * arrow turning over at the threshold is what tells the thumb that letting go
 * now will do something.
 */

import { ArrowDown, Loader2 } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import type { PullToRefreshState } from '../hooks/usePullToRefresh';

/** The disc starts this far above the top edge, fully hidden. */
const HIDDEN_OFFSET_PX = 44;

const LABEL: Record<Exclude<PullToRefreshState['status'], 'idle'>, string> = {
  pulling: 'Pull to refresh',
  armed: 'Release to refresh',
  refreshing: 'Refreshing',
};

export function PullToRefreshIndicator({ pull, status }: PullToRefreshState) {
  if (status === 'idle') return null;
  const refreshing = status === 'refreshing';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pull-to-refresh"
      data-state={status}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      style={{
        transform: `translateY(${pull - HIDDEN_OFFSET_PX}px)`,
        // Follow the finger exactly while pulling; ease only once it has let go.
        transition: refreshing ? 'transform var(--duration-settle) var(--ease-out-soft)' : undefined,
      }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-white text-accent-terracotta shadow-md ring-1 ring-gray-100">
        {refreshing ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowDown
            className={cn(
              'h-5 w-5 transition-transform duration-(--duration-quick) ease-out-soft',
              status === 'armed' && 'rotate-180',
            )}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="sr-only">{LABEL[status]}</span>
    </div>
  );
}
