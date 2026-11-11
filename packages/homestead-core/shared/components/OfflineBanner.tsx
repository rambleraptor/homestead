/**
 * Global offline indicator. Renders a strip along the bottom of the shell
 * while the app is offline. Mounts once inside `AppShell`, under the page, so
 * every authenticated route shows it without per-page wiring. It takes its
 * own row rather than floating over the page: a page that docks something at
 * the bottom (the home's composer) would otherwise have it covered.
 *
 * The status is sourced from `useOnlineStatus()`, which subscribes to React
 * Query's `onlineManager` — the same source that pauses + resumes mutations.
 * That keeps the UI claim ("changes will sync when you reconnect") in sync
 * with the queue's actual state.
 *
 * The strip slides up on arrival rather than appearing outright. Losing
 * connectivity is a moment where the app suddenly looks like it might be
 * broken, and a bar that materialises over the content reinforces that; one
 * that slides in from the edge reads as the app telling you something it
 * already knew how to handle.
 *
 * Only the entrance is animated — going offline is the half worth softening.
 * Reconnecting unmounts immediately, which is deliberate on two counts: the
 * live region should stop existing once its status no longer holds, and good
 * news has no reason to linger on screen. It also keeps the element genuinely
 * absent while online, which is what the e2e spec asserts and what a
 * translated-but-mounted bar would quietly break.
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
      className="shrink-0 animate-slide-up bg-amber-500 text-white px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm text-center"
    >
      You are offline. Changes will sync when you reconnect.
    </div>
  );
}
