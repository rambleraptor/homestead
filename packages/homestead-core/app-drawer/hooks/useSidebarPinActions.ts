/**
 * Move an entry into or out of the signed-in person's sidebar, and reset, on
 * top of `useSidebarPins`. Each action writes the whole pair of lists,
 * computed by the pure `withPinChanged`, so a choice that matches the default
 * clears its override instead of recording one.
 */

import { useCallback } from 'react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { withPinChanged } from '@rambleraptor/homestead-core/apps/sidebarPins';
import { useSidebarPins, type SidebarPins } from '@rambleraptor/homestead-core/apps/useSidebarPins';
import { useUpdateSidebarPins } from './useUpdateSidebarPins';

export interface SidebarPinActions extends SidebarPins {
  setPinned: (appId: string, pinned: boolean) => Promise<void>;
  reset: () => Promise<void>;
  /** Whether the person has any override to reset. */
  customized: boolean;
  isSaving: boolean;
}

export function useSidebarPinActions(): SidebarPinActions {
  const { user } = useAuth();
  const pins = useSidebarPins();
  const update = useUpdateSidebarPins();
  const pinned = user?.sidebar_pinned_apps;
  const unpinned = user?.sidebar_unpinned_apps;
  const { entries, defaultIds } = pins;

  const setPinned = useCallback(
    async (appId: string, next: boolean) => {
      await update.mutateAsync(
        withPinChanged({ pinned, unpinned }, entries, appId, next, { defaultIds }),
      );
    },
    [update, pinned, unpinned, entries, defaultIds],
  );

  const reset = useCallback(async () => {
    await update.mutateAsync({ pinned: [], unpinned: [] });
  }, [update]);

  return {
    ...pins,
    setPinned,
    reset,
    customized: (pinned?.length ?? 0) + (unpinned?.length ?? 0) > 0,
    isSaving: update.isPending,
  };
}
