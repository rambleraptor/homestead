/**
 * Tests for the module registry's flag aggregation, in particular the
 * auto-injected built-in `enabled` flag that every module receives —
 * including nested children, so each can be gated independently.
 */

import { describe, it, expect } from 'vitest';
import {
  getAllModuleFlagDefs,
  getModuleById,
  moduleRegistry,
  BUILTIN_ENABLED_FLAG_KEY,
} from '../registry';
import { MODULE_VISIBILITY_OPTIONS } from '../settings/visibility';
import type { HomeModule } from '../types';

function collectAllIds(mods: HomeModule[]): string[] {
  const out: string[] = [];
  const visit = (m: HomeModule) => {
    out.push(m.id);
    for (const c of m.children ?? []) visit(c);
  };
  for (const m of mods) visit(m);
  return out;
}

describe('getAllModuleFlagDefs', () => {
  it('injects an `enabled` enum flag into every registered module, including nested children', () => {
    const defs = getAllModuleFlagDefs();
    const allIds = collectAllIds(moduleRegistry.modules);
    expect(Object.keys(defs).sort()).toEqual(allIds.sort());
    for (const id of allIds) {
      const flag = defs[id][BUILTIN_ENABLED_FLAG_KEY];
      expect(flag).toBeDefined();
      expect(flag.type).toBe('enum');
      if (flag.type === 'enum') {
        expect(flag.options).toEqual(MODULE_VISIBILITY_OPTIONS);
      }
    }
  });

  it("honors each module's `defaultEnabled` for the injected flag's default", () => {
    const defs = getAllModuleFlagDefs();
    const recipesFlag = defs.recipes[BUILTIN_ENABLED_FLAG_KEY];
    expect(recipesFlag.type).toBe('enum');
    if (recipesFlag.type === 'enum') {
      expect(recipesFlag.default).toBe('superusers');
    }
  });

  it("defaults modules without `defaultEnabled` to 'all'", () => {
    const defs = getAllModuleFlagDefs();
    const dashboardFlag = defs.dashboard[BUILTIN_ENABLED_FLAG_KEY];
    expect(dashboardFlag.type).toBe('enum');
    if (dashboardFlag.type === 'enum') {
      expect(dashboardFlag.default).toBe('all');
    }
  });

  it('preserves module-declared flags alongside the built-in one', () => {
    const defs = getAllModuleFlagDefs();
    // `settings.omnibox_access` is a module-declared flag; it should
    // still be present after the built-in is merged in.
    expect(defs.settings.omnibox_access).toBeDefined();
    expect(defs.settings[BUILTIN_ENABLED_FLAG_KEY]).toBeDefined();
  });

  it('inherits the parent audience for nested superuser-only children', () => {
    const defs = getAllModuleFlagDefs();
    for (const childId of ['users', 'flag-management']) {
      const flag = defs[childId][BUILTIN_ENABLED_FLAG_KEY];
      expect(flag.type).toBe('enum');
      if (flag.type === 'enum') {
        expect(flag.default).toBe('superusers');
      }
    }
  });
});

describe('getModuleById', () => {
  it('resolves top-level modules', () => {
    expect(getModuleById('games')?.name).toBe('Games');
  });

  it('resolves nested children so flag UIs can render their names', () => {
    expect(getModuleById('minigolf')?.name).toBe('Mini Golf');
    expect(getModuleById('flag-management')?.name).toBe('Flag Management');
  });

  it('returns undefined for unknown ids', () => {
    expect(getModuleById('does-not-exist')).toBeUndefined();
  });
});
