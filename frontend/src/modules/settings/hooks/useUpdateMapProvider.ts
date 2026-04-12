/**
 * Update Map Provider Mutation Hook
 *
 * Routes through aepbase or PB based on the `settings` backend flag.
 *
 *  - PocketBase stored `map_provider` directly on the user record.
 *  - aepbase has no extensible user record; per-user settings live in a
 *    `preferences` child resource at `/users/{user_id}/preferences/{id}`.
 *    There is no upsert primitive: list, then update or create.
 *
 * Both branches call `refreshUser()` afterward so AuthContext re-merges
 * the new value into the in-memory User object.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { pb, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { useAuth } from '@/core/auth/useAuth';
import type { MapProvider } from '@/core/auth/types';

interface UserPreferenceRecord {
  id: string;
  map_provider?: MapProvider;
}

export function useUpdateMapProvider() {
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (mapProvider: MapProvider) => {
      if (isAepbaseEnabled('settings')) {
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
      }

      // PocketBase path: write directly to the user record.
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('User not authenticated');

      return await pb.collection(Collections.USERS).update(userId, {
        map_provider: mapProvider,
      });
    },
    onSuccess: async () => {
      await refreshUser();
    },
  });
}
