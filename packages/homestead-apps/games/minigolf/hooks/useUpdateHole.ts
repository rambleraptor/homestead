/**
 * Update Hole Mutation Hook — used when a player revisits a hole and
 * changes par or strokes.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { GAMES, GAME_HOLES } from '../resources';
import type { Hole, HoleFormData } from '../types';

interface UpdateHoleParams {
  gameId: string;
  holeId: string;
  data: Partial<HoleFormData>;
}

export function useUpdateHole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ gameId, holeId, data }: UpdateHoleParams): Promise<Hole> => {
      return await aepbase.update<Hole>(
        GAME_HOLES,
        holeId,
        data,
        { parent: [GAMES, gameId] },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('minigolf').all(),
      });
    },
  });
}
