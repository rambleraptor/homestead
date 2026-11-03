/**
 * Edit the household's sidebar defaults: which apps start out in the sidebar
 * for everyone who hasn't chosen for themselves. Writes the drawer app's
 * `sidebar_defaults` flag, keeping only exceptions to what each app declares
 * (`withDefaultChanged`), so a newly installed app follows its own config
 * rather than a frozen list.
 *
 * The page that calls this is superuser-gated; the flag itself is writable
 * by whoever may write app flags, as every flag is.
 */

import { useCallback } from 'react';
import { withDefaultChanged, type SidebarEntry } from '@rambleraptor/homestead-core/apps/sidebarPins';
import {
  APP_DRAWER_ID,
  SIDEBAR_DEFAULTS_FLAG,
  useSidebarPins,
} from '@rambleraptor/homestead-core/apps/useSidebarPins';
import { useAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useAppFlag';

export interface SidebarDefaults {
  /** Every navigation entry the superuser can reach, in nav order. */
  entries: SidebarEntry[];
  /** Ids of the entries pinned by default right now. */
  defaultIds: Set<string>;
  setDefault: (entry: SidebarEntry, pinned: boolean) => Promise<void>;
  isSaving: boolean;
}

export function useSidebarDefaults(): SidebarDefaults {
  const { entries, defaultIds, defaultOverrides } = useSidebarPins();
  const { setValue, isSaving } = useAppFlag<string>(APP_DRAWER_ID, SIDEBAR_DEFAULTS_FLAG);

  const setDefault = useCallback(
    async (entry: SidebarEntry, pinned: boolean) => {
      await setValue(JSON.stringify(withDefaultChanged(defaultOverrides, entry, pinned)));
    },
    [setValue, defaultOverrides],
  );

  return { entries, defaultIds, setDefault, isSaving };
}
