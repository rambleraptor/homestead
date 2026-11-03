/**
 * The signed-in person's navigation apps, split into what they can see and
 * what they've pinned. The sidebar lists the pinned subset; the app drawer
 * lists everything visible. Both read this one hook, so the two never
 * disagree about what a person may reach.
 *
 * The default for an app the person hasn't chosen about comes from the
 * household's `sidebar_defaults` flag over the app's own `pinnedByDefault`
 * (see `sidebarPins.ts`). Until the flag has loaded, the apps' own
 * declarations stand in.
 */

import { useMemo } from 'react';
import { useAuth } from '../auth/useAuth';
import { useAppFlag } from '../settings/hooks/useAppFlag';
import { getNavigationApps } from './registry';
import {
  defaultPinIds,
  parseDefaultPinOverrides,
  resolveSidebarPins,
  type DefaultPinOverrides,
  type PinState,
} from './sidebarPins';
import type { AppConfig } from './types';
import { useAppVisible } from './useAppVisibility';

/** The drawer app and the flag holding the household's default-pin overrides. */
export const APP_DRAWER_ID = 'apps';
export const SIDEBAR_DEFAULTS_FLAG = 'sidebar_defaults';

export interface SidebarPins {
  /** Every navigation app the person may reach, in nav order. */
  visibleApps: AppConfig[];
  /** The visible apps the sidebar lists. */
  pinnedApps: AppConfig[];
  /** Pin state per visible app id. */
  states: Map<string, PinState>;
  /** Ids of the visible apps pinned by default, before anyone's choice. */
  defaultIds: Set<string>;
  /** The household's overrides of the apps' declared defaults. */
  defaultOverrides: DefaultPinOverrides;
}

export function useSidebarPins(): SidebarPins {
  const { user } = useAuth();
  const isVisible = useAppVisible();
  const { value: rawDefaults } = useAppFlag<string>(APP_DRAWER_ID, SIDEBAR_DEFAULTS_FLAG);
  const pinned = user?.sidebar_pinned_apps;
  const unpinned = user?.sidebar_unpinned_apps;
  return useMemo(() => {
    const visibleApps = user ? getNavigationApps().filter(isVisible) : [];
    const defaultOverrides = parseDefaultPinOverrides(rawDefaults);
    const defaultIds = defaultPinIds(visibleApps, defaultOverrides);
    const states = resolveSidebarPins(visibleApps, { pinned, unpinned }, { defaultIds });
    return {
      visibleApps,
      pinnedApps: visibleApps.filter((app) => states.get(app.id)?.pinned),
      states,
      defaultIds,
      defaultOverrides,
    };
  }, [user, isVisible, rawDefaults, pinned, unpinned]);
}
