/**
 * Single Pictionary game by id.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import type { PictionaryGame } from '../types';

export function useGame(gameId: string | null) {
  return useQuery({
    queryKey: queryKeys.module('pictionary').detail(gameId || ''),
    queryFn: async (): Promise<PictionaryGame | null> => {
      if (!gameId) return null;
      return await aepbase.get<PictionaryGame>(
        AepCollections.PICTIONARY_GAMES,
        gameId,
      );
    },
    enabled: !!gameId,
  });
}
