/**
 * The signed-in person's navigation entries, split into what they can see
 * and what's in their sidebar. The sidebar lists the pinned subset; the app
 * drawer lists everything visible in two lists. Both read this one hook, so
 * the two never disagree about what a person may reach.
 *
 * The default for an entry the person hasn't chosen about comes from the
 * household's `sidebar_defaults` flag over the app's own declaration (see
 * `sidebarPins.ts`). Until the flag has loaded, the declarations stand in.
 */

import { useMemo } from 'react';
import { useAuth } from '../auth/useAuth';
import { useAppFlag } from '../settings/hooks/useAppFlag';
import { getNavigationApps } from './registry';
import {
  defaultPinIds,
  movableEntries,
  parseDefaultPinOverrides,
  resolveSidebarPins,
  sidebarEntries,
  type DefaultPinOverrides,
  type PinState,
  type SidebarEntry,
} from './sidebarPins';
import { useAppVisible } from './useAppVisibility';

/** The drawer app and the flag holding the household's default-pin overrides. */
export const APP_DRAWER_ID = 'apps';
export const SIDEBAR_DEFAULTS_FLAG = 'sidebar_defaults';

export interface SidebarPins {
  /**
   * Every navigation entry the person may move, in nav order: what the
   * drawer lists. The fixed entries (Superuser, Settings) are left out.
   */
  entries: SidebarEntry[];
  /** The entries the sidebar lists: the fixed ones plus what's pinned. */
  pinnedEntries: SidebarEntry[];
  /** Pin state per visible app id. */
  states: Map<string, PinState>;
  /** Ids of the visible entries pinned by default, before anyone's choice. */
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
    const all = user ? sidebarEntries(getNavigationApps(), isVisible) : [];
    const defaultOverrides = parseDefaultPinOverrides(rawDefaults);
    const defaultIds = defaultPinIds(all, defaultOverrides);
    const states = resolveSidebarPins(all, { pinned, unpinned }, { defaultIds });
    return {
      entries: movableEntries(all),
      pinnedEntries: all.filter((e) => states.get(e.app.id)?.pinned),
      states,
      defaultIds,
      defaultOverrides,
    };
  }, [user, isVisible, rawDefaults, pinned, unpinned]);
}
