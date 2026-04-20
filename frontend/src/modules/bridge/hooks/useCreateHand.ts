/**
 * Create Hand mutation. `created_by` is the aepbase resource path
 * `users/{id}`. `played_at` defaults to now if the caller didn't set one.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { Hand, HandFormData } from '../types';

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

export function useCreateHand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: HandFormData): Promise<Hand> => {
      const payload = {
        played_at: data.played_at || new Date().toISOString(),
        north_level: data.north_level,
        north_suit: data.north_suit,
        south_level: data.south_level,
        south_suit: data.south_suit,
        east_level: data.east_level,
        east_suit: data.east_suit,
        west_level: data.west_level,
        west_suit: data.west_suit,
        notes: data.notes,
        created_by: createdByPath(),
      };
      return await aepbase.create<Hand>(AepCollections.BRIDGE_HANDS, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('bridge').all(),
      });
    },
    onError: (error) => {
      logger.error('Failed to create bridge hand', error);
    },
  });
}
