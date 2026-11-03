/**
 * Edit the household's sidebar defaults: which apps start out pinned for
 * everyone who hasn't chosen for themselves. Writes the drawer app's
 * `sidebar_defaults` flag, keeping only exceptions to what each app
 * declares (`withDefaultChanged`), so a newly installed app follows its own
 * config rather than a frozen list.
 *
 * The UI that calls this is shown to superusers only; the flag itself is
 * writable by whoever may write app flags, as every flag is.
 */

import { useCallback } from 'react';
import { withDefaultChanged } from '@rambleraptor/homestead-core/apps/sidebarPins';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import {
  APP_DRAWER_ID,
  SIDEBAR_DEFAULTS_FLAG,
  useSidebarPins,
} from '@rambleraptor/homestead-core/apps/useSidebarPins';
import { useAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useAppFlag';

export interface SidebarDefaults {
  /** Ids of the visible apps pinned by default right now. */
  defaultIds: Set<string>;
  setDefault: (app: AppConfig, pinned: boolean) => Promise<void>;
  isSaving: boolean;
}

export function useSidebarDefaults(): SidebarDefaults {
  const { defaultIds, defaultOverrides } = useSidebarPins();
  const { setValue, isSaving } = useAppFlag<string>(APP_DRAWER_ID, SIDEBAR_DEFAULTS_FLAG);

  const setDefault = useCallback(
    async (app: AppConfig, pinned: boolean) => {
      await setValue(JSON.stringify(withDefaultChanged(defaultOverrides, app, pinned)));
    },
    [setValue, defaultOverrides],
  );

  return { defaultIds, setDefault, isSaving };
}
