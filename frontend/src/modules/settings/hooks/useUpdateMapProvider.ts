import { useMutation } from '@tanstack/react-query';
import { pb, Collections } from '@/core/api/pocketbase';
import { useAuth } from '@/core/auth/useAuth';
import type { MapProvider } from '@/core/auth/types';

export function useUpdateMapProvider() {
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (mapProvider: MapProvider) => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('User not authenticated');

      return await pb.collection(Collections.USERS).update(userId, {
        map_provider: mapProvider,
      });
    },
    onSuccess: async () => {
      // Refresh the user data to get the updated map_provider
      await refreshUser();
    },
  });
}
