/**
 * Pull-to-refresh for the shell's scrolling main region.
 *
 * Mounted by `AppShell` for pages that scroll under the chrome (not the ones
 * that fill the area and own their scrolling, like the home). It only listens
 * where the pointer is a finger: on a desktop, in happy-dom and in Playwright's
 * desktop profile `(pointer: coarse)` is false, so nothing is attached and the
 * indicator never exists. The refresh itself is the blunt, honest one —
 * invalidate every query — because the person asked for *everything* on this
 * screen to be checked, and the indicator spins until the refetches settle.
 */

import { useCallback, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '../shared/hooks/useMediaQuery';
import { usePullToRefresh } from '../shared/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '../shared/components/PullToRefreshIndicator';

interface PullToRefreshProps {
  /** The scroll region the gesture is read from; the indicator sits at its top. */
  scrollRef: RefObject<HTMLElement | null>;
}

export function PullToRefresh({ scrollRef }: PullToRefreshProps) {
  const coarse = useMediaQuery('(pointer: coarse)');
  if (!coarse) return null;
  return <ActivePullToRefresh scrollRef={scrollRef} />;
}

/** Split out so the query client is only reached for once a touch device is confirmed. */
function ActivePullToRefresh({ scrollRef }: PullToRefreshProps) {
  const queryClient = useQueryClient();
  const onRefresh = useCallback(() => queryClient.invalidateQueries(), [queryClient]);
  const state = usePullToRefresh(scrollRef, { onRefresh });
  return <PullToRefreshIndicator {...state} />;
}
