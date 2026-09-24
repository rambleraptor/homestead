import { useEffect, useRef, useState } from 'react';

/**
 * `held` while the screen is being kept awake; `failed` when the browser
 * refused the last request; `idle` when disabled or unsupported.
 */
export type WakeLockStatus = 'idle' | 'held' | 'failed';

/** Whether this browser can hold the screen awake (Screen Wake Lock API). */
export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Keep the screen from dimming or locking while `enabled` is true.
 *
 * The browser drops a wake lock whenever the page is hidden (tab switch, phone
 * locked), so the lock is re-requested each time the page becomes visible
 * again. A no-op where the API is unsupported; a refused request (e.g. battery
 * saver) is passed to `onError`.
 */
export function useWakeLock(
  enabled: boolean,
  onError?: (err: unknown) => void,
): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('idle');
  // Held in a ref so a caller passing an inline callback doesn't re-run the
  // effect (and release + re-request the lock) on every render.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled || !isWakeLockSupported()) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        setStatus('held');
      } catch (err) {
        if (cancelled) return;
        setStatus('failed');
        onErrorRef.current?.(err);
      }
    };

    const onVisibilityChange = () => {
      void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (sentinel && !sentinel.released) void sentinel.release();
      setStatus('idle');
    };
  }, [enabled]);

  return status;
}
