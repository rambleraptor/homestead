'use client';

/**
 * Global offline indicator. Renders a fixed strip at the bottom of the
 * viewport while the browser reports `navigator.onLine === false`. Mounts
 * once inside `AppShell` so every authenticated route shows it without
 * per-page wiring.
 *
 * The status is sourced from `useOnlineStatus()`, which subscribes to React
 * Query's `onlineManager` — the same source that pauses + resumes mutations.
 * That keeps the UI claim ("changes will sync when you reconnect") in sync
 * with the queue's actual state.
 */

import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineBanner() {
  const { isOffline } = useOnlineStatus();
  if (!isOffline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className="fixed bottom-0 inset-x-0 z-50 bg-amber-500 text-white px-4 py-2 text-sm text-center shadow-lg"
    >
      You are offline. Changes will sync when you reconnect.
    </div>
  );
}
