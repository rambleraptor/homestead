/**
 * Returns whether the current user should see the natural-language
 * omnibox (⌘K shortcut, header search button, `/search` page).
 *
 * Superusers can always use it; regular users can use it when the
 * household has flipped the `settings.omnibox_access` module flag to
 * `'all'`. The value is backed by the shared module-flag hook so it
 * updates reactively across the app when a superuser changes it.
 */

'use client';

import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useModuleFlag } from '@/modules/settings/hooks/useModuleFlag';
import type { OmniboxAccess } from '@/modules/settings/module.config';

export function useCanUseOmnibox(): boolean {
  const { user } = useAuth();
  const { value } = useModuleFlag<OmniboxAccess>(
    'settings',
    'omnibox_access',
  );
  if (user?.type === 'superuser') return true;
  return value === 'all';
}
