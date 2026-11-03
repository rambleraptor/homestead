/**
 * The sidebar pin resolver: a person's own pin or unpin wins over the default,
 * and with no default given every app is pinned.
 */

import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../types';
import {
  defaultPinIds,
  isPinnedByDefault,
  parseDefaultPinOverrides,
  pinnedApps,
  resolveSidebarPins,
  withDefaultChanged,
  withPinChanged,
} from '../sidebarPins';

function app(id: string): AppConfig {
  return { id, name: id, description: id } as unknown as AppConfig;
}

const APPS = [app('groceries'), app('recipes'), app('games')];

describe('resolveSidebarPins', () => {
  it('pins every app by default when no preferences and no defaults are given', () => {
    const states = resolveSidebarPins(APPS, undefined);
    for (const a of APPS) {
      expect(states.get(a.id)).toEqual({ pinned: true, source: 'default' });
    }
  });

  it("an unpin in the person's preferences wins over the default", () => {
    const states = resolveSidebarPins(APPS, { unpinned: ['games'] });
    expect(states.get('games')).toEqual({ pinned: false, source: 'unpinned' });
    expect(states.get('recipes')).toEqual({ pinned: true, source: 'default' });
  });

  it("a pin in the person's preferences wins over a default that leaves the app out", () => {
    const states = resolveSidebarPins(APPS, { pinned: ['games'] }, {
      defaultIds: new Set(['groceries']),
    });
    expect(states.get('games')).toEqual({ pinned: true, source: 'pinned' });
    expect(states.get('groceries')).toEqual({ pinned: true, source: 'default' });
    expect(states.get('recipes')).toEqual({ pinned: false, source: 'default' });
  });

  it('treats an id in both lists as pinned', () => {
    const states = resolveSidebarPins(APPS, { pinned: ['games'], unpinned: ['games'] });
    expect(states.get('games')?.pinned).toBe(true);
  });

  it('ignores preference ids for apps that are not in the list', () => {
    const states = resolveSidebarPins(APPS, { pinned: ['nope'], unpinned: ['nah'] });
    expect([...states.keys()]).toEqual(['groceries', 'recipes', 'games']);
  });
});

describe('withPinChanged', () => {
  it('records an unpin as an override when the default is pinned', () => {
    expect(withPinChanged(undefined, APPS, 'games', false)).toEqual({
      pinned: [],
      unpinned: ['games'],
    });
  });

  it('clears the override when the person chooses the default again', () => {
    const prefs = { pinned: [], unpinned: ['games'] };
    expect(withPinChanged(prefs, APPS, 'games', true)).toEqual({ pinned: [], unpinned: [] });
  });

  it('records a pin as an override when the default leaves the app out', () => {
    const defaults = { defaultIds: new Set(['groceries']) };
    expect(withPinChanged(undefined, APPS, 'games', true, defaults)).toEqual({
      pinned: ['games'],
      unpinned: [],
    });
    // Unpinning it again is the default, so no override remains.
    expect(withPinChanged({ pinned: ['games'] }, APPS, 'games', false, defaults)).toEqual({
      pinned: [],
      unpinned: [],
    });
  });

  it('leaves entries for other apps alone, including ids no longer visible', () => {
    const prefs = { pinned: ['stale'], unpinned: ['recipes'] };
    expect(withPinChanged(prefs, APPS, 'games', false)).toEqual({
      pinned: ['stale'],
      unpinned: ['recipes', 'games'],
    });
  });

  it('never leaves an app in both lists', () => {
    const prefs = { pinned: ['games'], unpinned: ['games'] };
    expect(withPinChanged(prefs, APPS, 'games', false)).toEqual({
      pinned: [],
      unpinned: ['games'],
    });
  });
});

describe('defaults', () => {
  const quiet = { id: 'health', name: 'Health', web: { pinnedByDefault: false } } as unknown as AppConfig;
  const loud = { id: 'todos', name: 'Todos', web: {} } as unknown as AppConfig;

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

  it('follows the app declaration unless the household overrides it', () => {
    expect(isPinnedByDefault(loud)).toBe(true);
    expect(isPinnedByDefault(quiet)).toBe(false);
    expect(isPinnedByDefault(quiet, { health: true })).toBe(true);
    expect(isPinnedByDefault(loud, { todos: false })).toBe(false);
    expect([...defaultPinIds([loud, quiet], { todos: false })]).toEqual([]);
    expect([...defaultPinIds([loud, quiet])]).toEqual(['todos']);
  });

  it('keeps only exceptions to what the app declares', () => {
    expect(withDefaultChanged({}, loud, false)).toEqual({ todos: false });
    expect(withDefaultChanged({ todos: false }, loud, true)).toEqual({});
    expect(withDefaultChanged({ games: false }, quiet, true)).toEqual({ games: false, health: true });
    expect(withDefaultChanged({ health: true }, quiet, false)).toEqual({});
  });

  it('feeds the resolver: a person who chose nothing follows the household default', () => {
    const defaults = defaultPinIds([loud, quiet], { todos: false });
    const states = resolveSidebarPins([loud, quiet], undefined, { defaultIds: defaults });
    expect(states.get('todos')).toEqual({ pinned: false, source: 'default' });
    expect(states.get('health')).toEqual({ pinned: false, source: 'default' });
  });
});

describe('pinnedApps', () => {
  it('keeps the input order and drops unpinned apps', () => {
    const result = pinnedApps(APPS, { unpinned: ['recipes'] });
    expect(result.map((a) => a.id)).toEqual(['groceries', 'games']);
  });
});
