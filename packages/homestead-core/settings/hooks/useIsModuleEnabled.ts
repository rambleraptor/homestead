'use client';

/**
 * Hooks for gating access to a module via its built-in `enabled` flag.
 *
 * Semantics for every module:
 *   - 'all'        → every signed-in user
 *   - 'superusers' → only superusers
 *   - 'none'       → nobody (superusers do NOT bypass)
 *
 * Signed-out visitors never pass, regardless of the stored value.
 */

import { useMemo } from 'react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useModuleFlag } from './useModuleFlag';
import { useModuleFlags } from './useModuleFlags';
import type { User } from '@rambleraptor/homestead-core/auth/types';
import {
  DEFAULT_MODULE_VISIBILITY,
  type ModuleVisibility,
} from '../visibility';

function resolveVisibility(
  visibility: ModuleVisibility,
  user: User | null,
): boolean {
  if (visibility === 'none') return false;
  if (!user) return false;
  if (visibility === 'all') return true;
  return user.type === 'superuser';
}

/**
 * Read a single module's enabled flag and return whether the current
 * viewer can use it.
 */
export function useIsModuleEnabled(moduleId: string): boolean {
  const { user } = useAuth();
  const { value } = useModuleFlag<ModuleVisibility>(moduleId, 'enabled');
  const visibility: ModuleVisibility = value ?? DEFAULT_MODULE_VISIBILITY;
  return resolveVisibility(visibility, user);
}

/**
 * Returns a predicate `(moduleId) => boolean` backed by a single read of
 * the module-flags singleton. Use this when you need to filter a list of
 * modules — calling `useIsModuleEnabled` in a loop would violate the
 * rules of hooks.
 */
export function useModuleEnabledPredicate(): (moduleId: string) => boolean {
  const { user } = useAuth();
  const { values } = useModuleFlags();

  return useMemo(() => {
    return (moduleId: string): boolean => {
      const raw = values[moduleId]?.enabled;
      const visibility: ModuleVisibility =
        typeof raw === 'string' && (raw === 'all' || raw === 'superusers' || raw === 'none')
          ? raw
          : DEFAULT_MODULE_VISIBILITY;
      return resolveVisibility(visibility, user);
    };
  }, [values, user]);
}
