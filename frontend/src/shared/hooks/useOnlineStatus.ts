'use client';

import { useEffect, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';

/**
 * Reactive online/offline flag.
 *
 * Subscribes to React Query's `onlineManager` (which itself listens to the
 * browser `online`/`offline` events) so any UI badge stays in sync with the
 * same source of truth that pauses + resumes mutations.
 */
export function useOnlineStatus(): { isOnline: boolean; isOffline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    return onlineManager.subscribe((online) => {
      setIsOnline(online);
    });
  }, []);

  return { isOnline, isOffline: !isOnline };
}
