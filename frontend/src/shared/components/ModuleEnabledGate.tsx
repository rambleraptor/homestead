'use client';

/**
 * Page-level gate that hides a module's content from viewers who don't
 * pass its built-in `enabled` flag. Mirrors the audience resolution
 * `useIsModuleEnabled` performs for the sidebar — `'none'` blocks
 * everyone, `'superusers'` only superusers, `'all'` every signed-in
 * user — but fronted by a UI: a spinner while auth and flags load, a
 * redirect to `fallbackPath` once we know the viewer is disallowed.
 *
 * Use this on nested module pages (and any direct-link surface) so a
 * disabled module isn't reachable just by typing the URL.
 */

import React, { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useModuleFlag } from '@/modules/settings/hooks/useModuleFlag';
import {
  DEFAULT_MODULE_VISIBILITY,
  type ModuleVisibility,
} from '@/modules/settings/visibility';
import { Spinner } from './Spinner';

interface Props {
  moduleId: string;
  children: ReactNode;
  /** Where to send disallowed viewers. Defaults to `/dashboard`. */
  fallbackPath?: string;
}

export function ModuleEnabledGate({
  moduleId,
  children,
  fallbackPath = '/dashboard',
}: Props) {
  const { user, isLoading: authLoading } = useAuth();
  const { value, isLoading: flagLoading } = useModuleFlag<ModuleVisibility>(
    moduleId,
    'enabled',
  );
  const router = useRouter();

  const isLoading = authLoading || flagLoading;
  const visibility: ModuleVisibility = value ?? DEFAULT_MODULE_VISIBILITY;
  const allowed = !isLoading && resolveVisibility(visibility, user);

  useEffect(() => {
    if (isLoading) return;
    if (!allowed) router.replace(fallbackPath);
  }, [isLoading, allowed, router, fallbackPath]);

  if (!allowed) {
    return (
      <div
        className="flex items-center justify-center h-64"
        data-testid="module-enabled-gate-loading"
      >
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}

function resolveVisibility(
  visibility: ModuleVisibility,
  user: ReturnType<typeof useAuth>['user'],
): boolean {
  if (visibility === 'none') return false;
  if (!user) return false;
  if (visibility === 'all') return true;
  return user.type === 'superuser';
}
