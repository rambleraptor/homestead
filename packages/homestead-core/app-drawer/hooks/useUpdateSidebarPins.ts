/**
 * Save the current user's sidebar pins.
 *
 * Per-user settings live in a `preferences` child resource under
 * /users/{user_id}, like the dashboard widget preferences: there's no upsert
 * primitive, so list, then update the existing record or create one. Both
 * lists are stored as JSON-encoded string arrays, since aepbase strips
 * JSON-schema constraints on round-trip and a flat string field keeps the
 * schema simple. Going through the aepbase wrapper means the write lands in
 * the offline outbox like every other preference.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { USERS, USER_PREFERENCES } from '@rambleraptor/homestead-core/resources/builtins';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';

interface UserPreferenceRecord {
  id: string;
  sidebar_pinned_apps?: string;
  sidebar_unpinned_apps?: string;
}

export interface SidebarPinsInput {
  /** App ids pinned over the default. */
  pinned: string[];
  /** App ids unpinned over the default. */
  unpinned: string[];
}

export function useUpdateSidebarPins() {
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async ({ pinned, unpinned }: SidebarPinsInput) => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) throw new Error('User not authenticated');

      const parent = [USERS, userId];
      const payload = {
        sidebar_pinned_apps: JSON.stringify(pinned),
        sidebar_unpinned_apps: JSON.stringify(unpinned),
      };

      const existing = await aepbase.list<UserPreferenceRecord>(USER_PREFERENCES, { parent });
      if (existing.length > 0) {
        return await aepbase.update<UserPreferenceRecord>(
          USER_PREFERENCES,
          existing[0].id,
          payload,
          { parent },
        );
      }
      return await aepbase.create<UserPreferenceRecord>(USER_PREFERENCES, payload, { parent });
    },
    onSuccess: async () => {
      await refreshUser();
    },
  });
}
