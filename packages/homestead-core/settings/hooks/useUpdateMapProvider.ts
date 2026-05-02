/**
 * Update the current user's map_provider preference.
 *
 * Per-user settings live in a `preferences` child resource under
 * /users/{user_id}. There's no upsert primitive: list, then update the
 * existing record or create a new one.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import type { MapProvider } from '@rambleraptor/homestead-core/auth/types';

interface UserPreferenceRecord {
  id: string;
  map_provider?: MapProvider;
}

export function useUpdateMapProvider() {
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (mapProvider: MapProvider) => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) throw new Error('User not authenticated');

      const parent = [AepCollections.USERS, userId];
      const existing = await aepbase.list<UserPreferenceRecord>(
        AepCollections.USER_PREFERENCES,
        { parent },
      );

      if (existing.length > 0) {
        return await aepbase.update<UserPreferenceRecord>(
          AepCollections.USER_PREFERENCES,
          existing[0].id,
          { map_provider: mapProvider },
          { parent },
        );
      }
      return await aepbase.create<UserPreferenceRecord>(
        AepCollections.USER_PREFERENCES,
        { map_provider: mapProvider },
        { parent },
      );
    },
    onSuccess: async () => {
      await refreshUser();
    },
  });
}
