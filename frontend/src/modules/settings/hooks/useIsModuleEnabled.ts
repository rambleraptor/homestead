'use client';

/**
 * Returns whether the current viewer can use the given module.
 *
 * Backed by the household-wide built-in `enabled` flag that the registry
 * auto-injects for every module:
 *   - 'all'        → every signed-in user
 *   - 'superusers' → only superusers
 *   - 'none'       → nobody (superusers do NOT bypass)
 *
 * Signed-out visitors never pass, regardless of the stored value.
 */

import { useAuth } from '@/core/auth/useAuth';
import { useModuleFlag } from './useModuleFlag';
import {
  DEFAULT_MODULE_VISIBILITY,
  type ModuleVisibility,
} from '../visibility';

export function useIsModuleEnabled(moduleId: string): boolean {
  const { user } = useAuth();
  const { value } = useModuleFlag<ModuleVisibility>(moduleId, 'enabled');
  const visibility: ModuleVisibility = value ?? DEFAULT_MODULE_VISIBILITY;

  if (visibility === 'none') return false;
  if (!user) return false;
  if (visibility === 'all') return true;
  return user.type === 'superuser';
}
