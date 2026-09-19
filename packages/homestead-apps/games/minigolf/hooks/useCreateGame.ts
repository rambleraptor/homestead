/**
 * Create Game Mutation Hook
 *
 * `created_by` is the aepbase resource path `users/{id}`. `played_at`
 * defaults to now if not provided.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { GAMES } from '../resources';
import type { Game, GameFormData } from '../types';

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

export function useCreateGame() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GameFormData): Promise<Game> => {
      const payload = {
        location: data.location,
        played_at: data.played_at || new Date().toISOString(),
        players: data.players,
        hole_count: data.hole_count,
        completed: false,
        created_by: createdByPath(),
      };
      return await aepbase.create<Game>(GAMES, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('minigolf').all(),
      });
    },
  });
}
