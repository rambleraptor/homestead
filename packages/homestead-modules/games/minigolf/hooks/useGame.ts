/**
 * Single game hook. Reads one game by id.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import type { Game } from '../types';

export function useGame(gameId: string | null) {
  return useQuery({
    queryKey: queryKeys.module('minigolf').detail(gameId || ''),
    queryFn: async (): Promise<Game | null> => {
      if (!gameId) return null;
      return await aepbase.get<Game>(AepCollections.GAMES, gameId);
    },
    enabled: !!gameId,
  });
}
