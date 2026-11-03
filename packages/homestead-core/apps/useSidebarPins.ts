/**
 * The signed-in person's navigation apps, split into what they can see and
 * what they've pinned. The sidebar lists the pinned subset; the app drawer
 * lists everything visible. Both read this one hook, so the two never
 * disagree about what a person may reach.
 */

import { useMemo } from 'react';
import { useAuth } from '../auth/useAuth';
import { getNavigationApps } from './registry';
import { resolveSidebarPins, type PinState } from './sidebarPins';
import type { AppConfig } from './types';
import { useAppVisible } from './useAppVisibility';

export interface SidebarPins {
  /** Every navigation app the person may reach, in nav order. */
  visibleApps: AppConfig[];
  /** The visible apps the sidebar lists. */
  pinnedApps: AppConfig[];
  /** Pin state per visible app id. */
  states: Map<string, PinState>;
}

export function useSidebarPins(): SidebarPins {
  const { user } = useAuth();
  const isVisible = useAppVisible();
  const pinned = user?.sidebar_pinned_apps;
  const unpinned = user?.sidebar_unpinned_apps;
  return useMemo(() => {
    const visibleApps = user ? getNavigationApps().filter(isVisible) : [];
    const states = resolveSidebarPins(visibleApps, { pinned, unpinned });
    return {
      visibleApps,
      pinnedApps: visibleApps.filter((app) => states.get(app.id)?.pinned),
      states,
    };
  }, [user, isVisible, pinned, unpinned]);
}
