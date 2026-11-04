import { useMemo } from 'react';
import { useResourceList } from '@rambleraptor/homestead-core/api/resourceHooks';
import { GARBAGE_PICKUPS } from '../resources';
import type { GarbagePickup } from '../types';
import { upcomingPickupDays, type PickupDay } from '../utils/pickups';

/**
 * Every stored pickup, oldest first.
 *
 * The whole collection is fetched rather than filtered to `pickup_date >= today`
 * server-side: `useResourceList` keys its cache by resource alone, so a filter
 * containing today's date would go stale at midnight without refetching. The
 * collection is small by construction — the sync writes a lookahead window and
 * prunes behind it — so the narrowing happens in {@link useUpcomingPickupDays}.
 */
export function useGarbagePickups() {
  return useResourceList<GarbagePickup>('home', 'garbage-pickup', GARBAGE_PICKUPS, {
    orderBy: 'pickup_date',
  });
}

/**
 * The next collection days, grouped so one day's streams render as one row.
 * Mirrors `useGarbagePickups`' query state so callers get a single hook.
 */
export function useUpcomingPickupDays(days = 14): {
  data: PickupDay[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, isError, error, refetch } = useGarbagePickups();
  const upcoming = useMemo(
    () => (data ? upcomingPickupDays(data, { days }) : undefined),
    [data, days],
  );
  return { data: upcoming, isLoading, isError, error, refetch: () => void refetch() };
}
