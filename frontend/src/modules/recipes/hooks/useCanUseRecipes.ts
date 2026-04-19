'use client';

/**
 * Thin wrapper around `useIsModuleEnabled('recipes')` kept for the
 * existing sidebar callsite. New code should call
 * `useIsModuleEnabled('recipes')` directly.
 */

import { useIsModuleEnabled } from '@/modules/settings/hooks/useIsModuleEnabled';

export function useCanUseRecipes(): boolean {
  return useIsModuleEnabled('recipes');
}
