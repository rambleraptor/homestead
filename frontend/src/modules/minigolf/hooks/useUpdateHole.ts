/**
 * Update Hole Mutation Hook — used when a player revisits a hole and
 * changes par or strokes.
 *
 * Stays on a plain `useMutation` rather than `useAepUpdate` because the
 * variables shape uses `holeId` (not `id`) at the call site.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Hole, HoleFormData } from '../types';

interface UpdateHoleParams {
  gameId: string;
  holeId: string;
  data: Partial<HoleFormData>;
}

export function useUpdateHole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, holeId, data }: UpdateHoleParams) =>
      aepbase.update<Hole>(AepCollections.GAME_HOLES, holeId, data, {
        parent: [AepCollections.GAMES, gameId],
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('minigolf').all(),
      }),
  });
}
