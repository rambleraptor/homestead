/**
 * Tests for the app registry's flag aggregation. There are no auto-injected
 * flags — the per-app `enabled`/`enabled_tags` audience pair was retired in
 * favor of the permission system — so `getAllAppFlagDefs` returns exactly each
 * app's declared flags.
 *
 * Imports through the frontend's shim (`@/apps/registry`) so the singleton is
 * initialized from the real `homestead.config.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  getAllAppFlagDefs,
  getAppById,
  getNavigationApps,
  getTopBarApps,
  appRegistry,
} from '@/apps/registry';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

function collectAllIds(mods: AppConfig[]): string[] {
  const out: string[] = [];
  const visit = (m: AppConfig) => {
    out.push(m.id);
    for (const c of m.children ?? []) visit(c);
  };
  for (const m of mods) visit(m);
  return out;
}

describe('getAllAppFlagDefs', () => {
  it('has an entry for every registered app, including nested children', () => {
    const defs = getAllAppFlagDefs();
    const allIds = collectAllIds(appRegistry.apps);
    expect(Object.keys(defs).sort()).toEqual(allIds.sort());
  });

  it('returns each app\'s declared flags and injects nothing', () => {
    const defs = getAllAppFlagDefs();
    // `groceries.default_store` is an app-declared flag.
    expect(defs.groceries.default_store).toBeDefined();
    // No auto-injected audience flags anymore.
    expect(defs.groceries.enabled).toBeUndefined();
    expect(defs.groceries.enabled_tags).toBeUndefined();
  });

  it('leaves flag-less apps with an empty flag map', () => {
    const defs = getAllAppFlagDefs();
    expect(defs.notifications).toEqual({});
    expect(defs.dashboard).toEqual({});
  });
});

describe('top-bar placement', () => {
  it('keeps topbar apps out of the sidebar navigation', () => {
    const navIds = getNavigationApps().map((m) => m.id);
    expect(navIds).not.toContain('notifications');
    expect(navIds).toContain('groceries');
  });

  it('returns topbar apps in navOrder', () => {
    const topBarIds = getTopBarApps().map((m) => m.id);
    expect(topBarIds).toEqual(['notifications']);
  });

  it('registers chat as an always-installed core app, out of navigation', () => {
    // Its conversations are on the home; `/chat` only redirects there.
    expect(getAppById('chat')?.web?.basePath).toBe('/chat');
    expect(getNavigationApps().map((m) => m.id)).not.toContain('chat');
    expect(getTopBarApps().map((m) => m.id)).not.toContain('chat');
  });
});

describe('getAppById', () => {
  it('resolves top-level apps', () => {
    expect(getAppById('games')?.name).toBe('Games');
  });

  it('resolves nested children so flag UIs can render their names', () => {
    expect(getAppById('minigolf')?.name).toBe('Mini Golf');
    expect(getAppById('flag-management')?.name).toBe('Flag Management');
  });

  it('returns undefined for unknown ids', () => {
    expect(getAppById('does-not-exist')).toBeUndefined();
  });
});
