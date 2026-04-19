/**
 * Tests for the module registry's flag aggregation, in particular the
 * auto-injected built-in `enabled` flag that every module receives.
 */

import { describe, it, expect } from 'vitest';
import {
  getAllModuleFlagDefs,
  moduleRegistry,
  BUILTIN_ENABLED_FLAG_KEY,
} from '../registry';
import { MODULE_VISIBILITY_OPTIONS } from '../settings/visibility';

describe('getAllModuleFlagDefs', () => {
  it('injects an `enabled` enum flag into every registered module', () => {
    const defs = getAllModuleFlagDefs();
    expect(Object.keys(defs).sort()).toEqual(
      moduleRegistry.modules.map((m) => m.id).sort(),
    );
    for (const mod of moduleRegistry.modules) {
      const flag = defs[mod.id][BUILTIN_ENABLED_FLAG_KEY];
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
});
