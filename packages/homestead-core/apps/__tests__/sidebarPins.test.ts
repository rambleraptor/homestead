/**
 * The sidebar pin resolver: a person's own choice wins over the household
 * default, which wins over what the app declares; a top-level app starts in
 * the sidebar and a nested child starts out of it.
 */

import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../types';
import {
  declaredDefault,
  defaultPinIds,
  entrySection,
  isPinnedByDefault,
  movableEntries,
  parseDefaultPinOverrides,
  pinnedEntries,
  resolveSidebarPins,
  sidebarEntries,
  withDefaultChanged,
  withPinChanged,
  type SidebarEntry,
} from '../sidebarPins';

function app(id: string, web: Record<string, unknown> = {}, children?: AppConfig[]): AppConfig {
  return { id, name: id, description: id, web: { basePath: `/${id}`, ...web }, children } as unknown as AppConfig;
}

const groceries = app('groceries', { section: 'Food' });
const recipes = app('recipes', { section: 'Food' });
const bridge = app('bridge');
const minigolf = app('minigolf');
const hidden = app('hidden', { showInNav: false });
const games = app('games', { section: 'Relationships' }, [bridge, minigolf, hidden]);

const ENTRIES: SidebarEntry[] = sidebarEntries([groceries, recipes, games], () => true);

describe('sidebarEntries', () => {
  it('lists each visible top-level app followed by its visible nav children', () => {
    expect(ENTRIES.map((e) => e.app.id)).toEqual(['groceries', 'recipes', 'games', 'bridge', 'minigolf']);
    expect(ENTRIES[3].parent?.id).toBe('games');
    expect(ENTRIES[0].parent).toBeUndefined();
  });

  it('drops apps the viewer cannot see, children included', () => {
    const entries = sidebarEntries([groceries, games], (a) => a.id !== 'bridge' && a.id !== 'recipes');
    expect(entries.map((e) => e.app.id)).toEqual(['groceries', 'games', 'minigolf']);
  });

  it('files a child under its parent section', () => {
    expect(entrySection(ENTRIES[3])).toBe('Relationships');
    expect(entrySection(ENTRIES[0])).toBe('Food');
  });
});

describe('fixed apps', () => {
  const users = app('users', { routes: [{ path: '', gates: ['superuser'] }] });
  const superuser = app('superuser', { section: 'Settings', routes: [{ path: '', gates: ['superuser'] }] }, [users]);
  const settings = app('settings', { section: 'Settings' });
  const all = sidebarEntries([groceries, superuser, settings], () => true);

  it('lists the Superuser tree and Settings as fixed, without children', () => {
    expect(all.map((e) => [e.app.id, e.fixed ?? false])).toEqual([
      ['groceries', false],
      ['superuser', true],
      ['settings', true],
    ]);
    expect(movableEntries(all).map((e) => e.app.id)).toEqual(['groceries']);
  });

  it('keeps a fixed app in the sidebar whatever the person or household says', () => {
    const states = resolveSidebarPins(all, { unpinned: ['superuser', 'settings', 'groceries'] }, {
      defaultIds: new Set(),
    });
    expect(states.get('superuser')).toEqual({ pinned: true, source: 'default' });
    expect(states.get('settings')).toEqual({ pinned: true, source: 'default' });
    expect(states.get('groceries')?.pinned).toBe(false);
  });
});

describe('resolveSidebarPins', () => {
  it('starts top-level apps in the sidebar and children out of it', () => {
    const states = resolveSidebarPins(ENTRIES, undefined);
    expect(states.get('groceries')).toEqual({ pinned: true, source: 'default' });
    expect(states.get('games')).toEqual({ pinned: true, source: 'default' });
    expect(states.get('bridge')).toEqual({ pinned: false, source: 'default' });
  });

  it("the person's own choice wins over the default", () => {
    const states = resolveSidebarPins(ENTRIES, { unpinned: ['games'], pinned: ['bridge'] });
    expect(states.get('games')).toEqual({ pinned: false, source: 'unpinned' });
    expect(states.get('bridge')).toEqual({ pinned: true, source: 'pinned' });
    expect(states.get('recipes')).toEqual({ pinned: true, source: 'default' });
  });

  it('a given set of default ids replaces the declarations', () => {
    const states = resolveSidebarPins(ENTRIES, undefined, { defaultIds: new Set(['bridge']) });
    expect(states.get('bridge')?.pinned).toBe(true);
    expect(states.get('groceries')?.pinned).toBe(false);
  });

  it('treats an id in both lists as pinned', () => {
    const states = resolveSidebarPins(ENTRIES, { pinned: ['games'], unpinned: ['games'] });
    expect(states.get('games')?.pinned).toBe(true);
  });

  it('ignores preference ids for apps that are not listed', () => {
    const states = resolveSidebarPins(ENTRIES, { pinned: ['nope'], unpinned: ['nah'] });
    expect([...states.keys()]).toEqual(['groceries', 'recipes', 'games', 'bridge', 'minigolf']);
  });
});

describe('withPinChanged', () => {
  it('records a choice as an override only when it differs from the default', () => {
    expect(withPinChanged(undefined, ENTRIES, 'games', false)).toEqual({ pinned: [], unpinned: ['games'] });
    expect(withPinChanged(undefined, ENTRIES, 'bridge', true)).toEqual({ pinned: ['bridge'], unpinned: [] });
    expect(withPinChanged({ unpinned: ['games'] }, ENTRIES, 'games', true)).toEqual({ pinned: [], unpinned: [] });
    expect(withPinChanged({ pinned: ['bridge'] }, ENTRIES, 'bridge', false)).toEqual({ pinned: [], unpinned: [] });
  });

  it('honours household defaults when deciding what is an override', () => {
    const defaults = { defaultIds: new Set(['bridge']) };
    expect(withPinChanged(undefined, ENTRIES, 'bridge', false, defaults)).toEqual({
      pinned: [],
      unpinned: ['bridge'],
    });
    expect(withPinChanged(undefined, ENTRIES, 'groceries', true, defaults)).toEqual({
      pinned: ['groceries'],
      unpinned: [],
    });
  });

  it('leaves entries for other apps alone, including ids no longer visible', () => {
    expect(withPinChanged({ pinned: ['stale'], unpinned: ['recipes'] }, ENTRIES, 'games', false)).toEqual({
      pinned: ['stale'],
      unpinned: ['recipes', 'games'],
    });
  });

  it('never leaves an app in both lists', () => {
    expect(withPinChanged({ pinned: ['games'], unpinned: ['games'] }, ENTRIES, 'games', false)).toEqual({
      pinned: [],
      unpinned: ['games'],
    });
  });
});

describe('defaults', () => {
  const quiet = { app: app('health', { pinnedByDefault: false }) };
  const loudChild = { app: app('bridge', { pinnedByDefault: true }), parent: games };

  it('parses the sidebar_defaults flag leniently', () => {
    expect(parseDefaultPinOverrides('')).toEqual({});
    expect(parseDefaultPinOverrides(undefined)).toEqual({});
    expect(parseDefaultPinOverrides('not json')).toEqual({});
    expect(parseDefaultPinOverrides('["games"]')).toEqual({});
    expect(parseDefaultPinOverrides('{"games": false, "health": true, "x": "no"}')).toEqual({
      games: false,
      health: true,
    });
  });

  it('follows the declaration: top-level in, child out, unless the app says otherwise', () => {
    expect(declaredDefault(ENTRIES[0])).toBe(true);
    expect(declaredDefault(ENTRIES[3])).toBe(false);
    expect(declaredDefault(quiet)).toBe(false);
    expect(declaredDefault(loudChild)).toBe(true);
  });

  it('lets the household override the declaration', () => {
    expect(isPinnedByDefault(quiet, { health: true })).toBe(true);
    expect(isPinnedByDefault(ENTRIES[3], { bridge: true })).toBe(true);
    expect([...defaultPinIds(ENTRIES, { games: false, bridge: true })]).toEqual([
      'groceries',
      'recipes',
      'bridge',
    ]);
  });

  it('keeps only exceptions to what the app declares', () => {
    expect(withDefaultChanged({}, ENTRIES[2], false)).toEqual({ games: false });
    expect(withDefaultChanged({ games: false }, ENTRIES[2], true)).toEqual({});
    expect(withDefaultChanged({}, ENTRIES[3], true)).toEqual({ bridge: true });
    expect(withDefaultChanged({ bridge: true }, ENTRIES[3], false)).toEqual({});
  });
});

describe('pinnedEntries', () => {
  it('keeps the input order and drops what is out of the sidebar', () => {
    const result = pinnedEntries(ENTRIES, { unpinned: ['recipes'], pinned: ['minigolf'] });
    expect(result.map((e) => e.app.id)).toEqual(['groceries', 'games', 'minigolf']);
  });
});
