/**
 * Keep a shared list in step with edits made on someone else's device.
 *
 * Another device's edits arrive through the server's change feed (see
 * changeFeed.ts) when it's connected; without it, reads are pull-only, so a
 * list two people edit at once goes stale on the device that isn't typing. The
 * global query defaults deliberately make refetching rare (`staleTime` of five
 * minutes, `refetchOnWindowFocus` off in production), which is right for data
 * one person owns and wrong for a household grocery list.
 *
 * Spread these options into such a query to opt it back in: refetch when the
 * tab regains focus (the phone-comes-out-of-a-pocket case, and the one that
 * covers most real use), and poll on a short interval while it stays open —
 * for the list left face-up on the counter while someone else shops. React
 * Query's `refetchIntervalInBackground` defaults to false, so a hidden tab
 * stops polling on its own.
 *
 * Polling pauses while the device is offline or has writes queued:
 *
 * - Offline, a poll can only fail. The failures would flip the query into an
 *   error state behind data that is still perfectly good to show, and
 *   `refetchOnReconnect` already re-reads the moment the network returns.
 * - Mid-replay, a poll is worse than useless: the server answers with rows
 *   that predate the queued writes, and that response overwrites the
 *   optimistic cache — visibly reverting the user's own edits until each
 *   mutation settles. Waiting costs nothing, since every mutation invalidates
 *   the list when it settles.
 */

import { useChangeFeedConnected } from './changeFeed';
import { useHasQueuedWrites } from './usePendingSync';
import { useOnlineStatus } from '../shared/hooks/useOnlineStatus';

/** How often an open, focused tab re-reads the list. */
export const LIVE_REFRESH_INTERVAL_MS = 15_000;

/**
 * The poll interval while the server's change feed is connected. The feed
 * delivers other devices' edits within a moment, so polling drops to a slow
 * safety net for anything it might miss.
 */
export const LIVE_REFRESH_FALLBACK_MS = 60_000;

/**
 * Short enough that returning to the tab always re-reads, long enough to
 * collapse the burst when focus, mount, and an interval tick coincide.
 */
const LIVE_STALE_TIME_MS = 5_000;

export interface LiveRefreshOptions {
  refetchOnWindowFocus: boolean;
  staleTime: number;
  refetchInterval: number | false;
}

export function useLiveRefresh(
  intervalMs: number = LIVE_REFRESH_INTERVAL_MS,
): LiveRefreshOptions {
  const hasQueuedWrites = useHasQueuedWrites();
  const { isOffline } = useOnlineStatus();
  const feedConnected = useChangeFeedConnected();

  let refetchInterval: number | false = intervalMs;
  if (isOffline || hasQueuedWrites) refetchInterval = false;
  else if (feedConnected) refetchInterval = Math.max(intervalMs, LIVE_REFRESH_FALLBACK_MS);

  return {
    refetchOnWindowFocus: true,
    staleTime: LIVE_STALE_TIME_MS,
    refetchInterval,
  };
}
