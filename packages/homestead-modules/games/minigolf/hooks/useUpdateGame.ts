/**
 * Update Game Mutation Hook — used to flag a game `completed` or edit notes.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { Game } from '../types';

interface UpdateGameParams {
  id: string;
  data: Partial<
    Pick<Game, 'location' | 'notes' | 'completed' | 'played_at' | 'hole_count'>
  >;
}

export function useUpdateGame() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateGameParams): Promise<Game> => {
      return await aepbase.update<Game>(AepCollections.GAMES, id, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('minigolf').all(),
      });
    },
    onError: (error) => {
      logger.error('Failed to update game', error);
    },
  });
}
