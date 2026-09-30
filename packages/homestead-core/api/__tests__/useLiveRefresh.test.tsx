/**
 * Tests for `useLiveRefresh`.
 *
 * What matters is when the poll is *not* running. Polling a shared list is
 * cheap and easy to get right; polling it while the offline queue still holds
 * the user's own edits is what reverts a checked-off item in front of them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  LIVE_REFRESH_FALLBACK_MS,
  LIVE_REFRESH_INTERVAL_MS,
  useLiveRefresh,
} from '../useLiveRefresh';
import { useChangeFeedConnected } from '../changeFeed';
import { useHasQueuedWrites } from '../usePendingSync';
import { useOnlineStatus } from '../../shared/hooks/useOnlineStatus';

vi.mock('../usePendingSync', () => ({ useHasQueuedWrites: vi.fn() }));
vi.mock('../../shared/hooks/useOnlineStatus', () => ({ useOnlineStatus: vi.fn() }));
vi.mock('../changeFeed', () => ({ useChangeFeedConnected: vi.fn(() => false) }));

function setState({ online, queued }: { online: boolean; queued: boolean }) {
  vi.mocked(useOnlineStatus).mockReturnValue({ isOnline: online, isOffline: !online });
  vi.mocked(useHasQueuedWrites).mockReturnValue(queued);
}

beforeEach(() => {
  setState({ online: true, queued: false });
  vi.mocked(useChangeFeedConnected).mockReturnValue(false);
});

describe('useLiveRefresh', () => {
  it('polls when online with an empty queue', () => {
    const { result } = renderHook(() => useLiveRefresh());

    expect(result.current.refetchInterval).toBe(LIVE_REFRESH_INTERVAL_MS);
  });

  it('honours a caller-supplied interval', () => {
    const { result } = renderHook(() => useLiveRefresh(3_000));

    expect(result.current.refetchInterval).toBe(3_000);
  });

  it('always refetches on focus', () => {
    // The global default disables focus refetching in production, which is
    // what leaves a shared list stale after the tab comes back.
    const { result } = renderHook(() => useLiveRefresh());

    expect(result.current.refetchOnWindowFocus).toBe(true);
  });

  it('goes stale well inside the poll interval, so a focus refetch fires', () => {
    const { result } = renderHook(() => useLiveRefresh());

    expect(result.current.staleTime).toBeLessThan(LIVE_REFRESH_INTERVAL_MS);
  });

  it('drops to a slow safety-net poll while the change feed is connected', () => {
    vi.mocked(useChangeFeedConnected).mockReturnValue(true);
    const { result } = renderHook(() => useLiveRefresh());

    expect(result.current.refetchInterval).toBe(LIVE_REFRESH_FALLBACK_MS);
  });

  it('stops polling while offline', () => {
    setState({ online: false, queued: false });
    const { result } = renderHook(() => useLiveRefresh());

    expect(result.current.refetchInterval).toBe(false);
  });

  it('stops polling while writes are queued', () => {
    // The reconnect window: online again, queue still replaying. A refetch
    // here answers with rows that predate the queued writes.
    setState({ online: true, queued: true });
    const { result } = renderHook(() => useLiveRefresh());

    expect(result.current.refetchInterval).toBe(false);
  });

  it('resumes polling once the queue drains', () => {
    setState({ online: true, queued: true });
    const { result, rerender } = renderHook(() => useLiveRefresh());
    expect(result.current.refetchInterval).toBe(false);

    setState({ online: true, queued: false });
    rerender();

    expect(result.current.refetchInterval).toBe(LIVE_REFRESH_INTERVAL_MS);
  });
});
