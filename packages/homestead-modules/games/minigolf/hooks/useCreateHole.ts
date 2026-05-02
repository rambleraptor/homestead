/**
 * Create Hole Mutation Hook
 *
 * Records one hole's score for a game. Parent id is part of the URL.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { Hole, HoleFormData } from '../types';

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

interface CreateHoleParams {
  gameId: string;
  data: HoleFormData;
}

export function useCreateHole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ gameId, data }: CreateHoleParams): Promise<Hole> => {
      return await aepbase.create<Hole>(
        AepCollections.GAME_HOLES,
        { ...data, created_by: createdByPath() },
        { parent: [AepCollections.GAMES, gameId] },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('minigolf').all(),
      });
    },
    onError: (error) => {
      logger.error('Failed to create hole', error);
    },
  });
}
