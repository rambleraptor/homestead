import type { ComponentType } from 'react';
import { NestedModuleLanding } from './NestedModuleLanding';
import type { HomeModule } from '@/modules/types';

/**
 * Bind a parent module to the generic landing as a no-arg
 * `ComponentType`, suitable for wiring into
 * `OmniboxAdapter.listComponent` from a `.ts` config file. The
 * getter-of-module dance avoids the temporal-dead-zone error you'd
 * get from referencing the in-flight const directly inside its own
 * object literal.
 *
 * Lives outside `NestedModuleLanding.tsx` so server-side imports of
 * the omnibox listComponent (e.g. the `/api/omnibox/parse` route)
 * can call this factory without crossing the `'use client'`
 * boundary. The returned component is still a client component —
 * it's the wrapper that's server-safe.
 */
export function makeNestedModuleLanding(
  getModule: () => HomeModule,
): ComponentType {
  function NestedLanding() {
    return <NestedModuleLanding module={getModule()} />;
  }
  NestedLanding.displayName = 'NestedModuleLanding';
  return NestedLanding;
}
