/**
 * Which of the apps a person can see are in their sidebar.
 *
 * Visibility (`useAppVisibility`) decides what a person may reach; the pins
 * here decide which of those apps the sidebar lists. A pin is a preference,
 * never a grant: an app that isn't visible is never pinned, and an app out of
 * the sidebar still opens from a link, a widget, or the assistant. The drawer
 * at `/apps` lists everything visible in two lists, "Your sidebar" and
 * "More apps", and moves an app between them.
 *
 * Nested apps take part on their own: a child (Bridge under Games) is an
 * entry of its own that can be in the sidebar while its parent isn't, or the
 * other way round. The sidebar lists a child under its parent's section.
 *
 * Precedence, per entry:
 *
 *   1. the person's own override (`sidebar_pinned_apps` / `sidebar_unpinned_apps`
 *      on their `user-preference` record);
 *   2. the household's override for that app (the drawer app's
 *      `sidebar_defaults` flag, a JSON object of app id → boolean holding only
 *      the exceptions, so an app installed later follows its own config);
 *   3. the app's own `web.pinnedByDefault`: true for a top-level app, false
 *      for a child, unless it says otherwise.
 *
 * Pure so the sidebar and the drawer run the same functions and can't disagree.
 */

import { ALWAYS_VISIBLE_APPS } from '../permissions/household';
import type { AppConfig } from './types';
import { isSuperuserOnlyApp } from './useAppVisibility';

/** A navigation app, with its parent when it's a nested child. */
export interface SidebarEntry {
  app: AppConfig;
  parent?: AppConfig;
  /**
   * Always in the sidebar and never in the drawer's lists: configuration
   * surfaces a person must not be able to lose. Superuser-only apps (the
   * Superuser tree) and the always-visible shell apps (Settings, the drawer).
   */
  fixed?: true;
}

/** Whether `app` is one of the fixed navigation apps (see `SidebarEntry.fixed`). */
export function isFixedNavApp(app: AppConfig): boolean {
  return isSuperuserOnlyApp(app) || ALWAYS_VISIBLE_APPS.includes(app.id);
}

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
  /** App ids pinned by default. Omit for "every entry's own declaration". */
  defaultIds?: ReadonlySet<string>;
}

/** Household overrides of apps' declared defaults: app id → pinned by default. */
export type DefaultPinOverrides = Record<string, boolean>;

/**
 * The navigation entries a viewer can reach, in nav order: each top-level
 * navigation app, followed by its visible children. A child is listed when
 * it has a web config and isn't kept out of nav itself. A fixed app is one
 * entry with no children of its own in the list — its children live on its
 * landing page and can't be moved anywhere.
 */
export function sidebarEntries(
  navApps: readonly AppConfig[],
  isVisible: (app: AppConfig) => boolean,
): SidebarEntry[] {
  const out: SidebarEntry[] = [];
  for (const app of navApps) {
    if (!isVisible(app)) continue;
    if (isFixedNavApp(app)) {
      out.push({ app, fixed: true });
      continue;
    }
    out.push({ app });
    for (const child of app.children ?? []) {
      if (!child.web || child.web.showInNav === false) continue;
      if (!isVisible(child)) continue;
      out.push({ app: child, parent: app });
    }
  }
  return out;
}

/** The entries a person may move: everything but the fixed ones. */
export function movableEntries(entries: readonly SidebarEntry[]): SidebarEntry[] {
  return entries.filter((e) => !e.fixed);
}

/** The section an entry files under: its own, or its parent's for a child. */
export function entrySection(entry: SidebarEntry): string {
  return entry.app.web?.section || entry.parent?.web?.section || '';
}

/** Parse the `sidebar_defaults` flag. Anything but a JSON object of booleans is "no overrides". */
export function parseDefaultPinOverrides(raw: unknown): DefaultPinOverrides {
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: DefaultPinOverrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** What the app itself declares: in the sidebar for a top-level app, out for a child. */
export function declaredDefault(entry: SidebarEntry): boolean {
  return entry.app.web?.pinnedByDefault ?? !entry.parent;
}

/** Whether `entry` is pinned by default, before any person's choice. */
export function isPinnedByDefault(
  entry: SidebarEntry,
  overrides: DefaultPinOverrides = {},
): boolean {
  return overrides[entry.app.id] ?? declaredDefault(entry);
}

/** The ids of the entries pinned by default. */
export function defaultPinIds(
  entries: readonly SidebarEntry[],
  overrides: DefaultPinOverrides = {},
): Set<string> {
  return new Set(
    entries.filter((e) => isPinnedByDefault(e, overrides)).map((e) => e.app.id),
  );
}

/**
 * The household overrides after a superuser sets `entry`'s default. Only an
 * exception to the app's own declaration is kept, so returning to what the
 * app declares removes the entry.
 */
export function withDefaultChanged(
  overrides: DefaultPinOverrides,
  entry: SidebarEntry,
  pinned: boolean,
): DefaultPinOverrides {
  const next = { ...overrides };
  delete next[entry.app.id];
  if (pinned !== declaredDefault(entry)) next[entry.app.id] = pinned;
  return next;
}

/**
 * Resolve the pin state of every entry. A fixed entry is always pinned,
 * whatever the lists say. An id present in both of a person's lists is
 * treated as pinned — the lists should never overlap, and showing an app is
 * the safer way to resolve a corrupt pair.
 */
export function resolveSidebarPins(
  entries: readonly SidebarEntry[],
  prefs: SidebarPinPreferences | undefined,
  options: ResolveSidebarPinsOptions = {},
): Map<string, PinState> {
  const pinnedByUser = new Set(prefs?.pinned ?? []);
  const unpinnedByUser = new Set(prefs?.unpinned ?? []);
  const out = new Map<string, PinState>();
  for (const entry of entries) {
    const id = entry.app.id;
    const byDefault = options.defaultIds ? options.defaultIds.has(id) : declaredDefault(entry);
    if (entry.fixed) {
      out.set(id, { pinned: true, source: 'default' });
    } else if (pinnedByUser.has(id)) {
      out.set(id, { pinned: true, source: 'pinned' });
    } else if (unpinnedByUser.has(id)) {
      out.set(id, { pinned: false, source: 'unpinned' });
    } else {
      out.set(id, { pinned: byDefault, source: 'default' });
    }
  }
  return out;
}

/**
 * The preference lists after a person pins or unpins `appId`. An override
 * is recorded only when the choice differs from the default; choosing the
 * default again clears it, so "back to the defaults" stays honest. Entries
 * for other apps are kept as they are — a stale id for an app the person
 * can no longer see is harmless and comes back into effect if their access
 * does.
 */
export function withPinChanged(
  prefs: SidebarPinPreferences | undefined,
  entries: readonly SidebarEntry[],
  appId: string,
  pinned: boolean,
  options: ResolveSidebarPinsOptions = {},
): { pinned: string[]; unpinned: string[] } {
  const byDefault = resolveSidebarPins(entries, undefined, options).get(appId)?.pinned ?? true;
  const pinnedList = (prefs?.pinned ?? []).filter((id) => id !== appId);
  const unpinnedList = (prefs?.unpinned ?? []).filter((id) => id !== appId);
  if (pinned !== byDefault) (pinned ? pinnedList : unpinnedList).push(appId);
  return { pinned: pinnedList, unpinned: unpinnedList };
}

/** The subset of `entries` that resolve as pinned, in the order given. */
export function pinnedEntries(
  entries: readonly SidebarEntry[],
  prefs: SidebarPinPreferences | undefined,
  options: ResolveSidebarPinsOptions = {},
): SidebarEntry[] {
  const states = resolveSidebarPins(entries, prefs, options);
  return entries.filter((e) => states.get(e.app.id)?.pinned);
}
