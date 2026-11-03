/**
 * Which of the apps a person can see are *pinned* to their sidebar.
 *
 * Visibility (`useAppVisibility`) decides what a person may reach; pinning
 * decides which of those apps the sidebar lists. A pin is a preference, never
 * a grant: an app that isn't visible is never pinned, and an unpinned app still
 * opens from a link, a widget, or the assistant. The drawer at `/apps` lists
 * everything visible, pinned or not.
 *
 * Precedence, per app:
 *
 *   1. the person's own override (`sidebar_pinned_apps` / `sidebar_unpinned_apps`
 *      on their `user-preference` record);
 *   2. otherwise the default — every app, until household defaults land.
 *
 * Pure so the sidebar and the drawer run the same function and can't disagree.
 */

import type { AppConfig } from './types';

export type PinSource = 'default' | 'pinned' | 'unpinned';

export interface PinState {
  pinned: boolean;
  /** Why: the default, or the person's own pin / unpin over it. */
  source: PinSource;
}

export interface SidebarPinPreferences {
  pinned?: readonly string[];
  unpinned?: readonly string[];
}

export interface ResolveSidebarPinsOptions {
  /**
   * App ids pinned by default. Omit for "every app", today's behavior and the
   * fallback until a household sets its own defaults.
   */
  defaultIds?: ReadonlySet<string>;
}

/**
 * Resolve the pin state of every app in `apps`. An id present in both of a
 * person's lists is treated as pinned — the lists should never overlap, and
 * showing an app is the safer way to resolve a corrupt pair.
 */
export function resolveSidebarPins(
  apps: readonly AppConfig[],
  prefs: SidebarPinPreferences | undefined,
  options: ResolveSidebarPinsOptions = {},
): Map<string, PinState> {
  const pinnedByUser = new Set(prefs?.pinned ?? []);
  const unpinnedByUser = new Set(prefs?.unpinned ?? []);
  const out = new Map<string, PinState>();
  for (const app of apps) {
    const byDefault = options.defaultIds ? options.defaultIds.has(app.id) : true;
    if (pinnedByUser.has(app.id)) {
      out.set(app.id, { pinned: true, source: 'pinned' });
    } else if (unpinnedByUser.has(app.id)) {
      out.set(app.id, { pinned: false, source: 'unpinned' });
    } else {
      out.set(app.id, { pinned: byDefault, source: 'default' });
    }
  }
  return out;
}

/** The subset of `apps` that resolve as pinned, in the order given. */
export function pinnedApps(
  apps: readonly AppConfig[],
  prefs: SidebarPinPreferences | undefined,
  options: ResolveSidebarPinsOptions = {},
): AppConfig[] {
  const states = resolveSidebarPins(apps, prefs, options);
  return apps.filter((app) => states.get(app.id)?.pinned);
}
