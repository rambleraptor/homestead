/**
 * Games list hook. aepbase has no sort param so we order client-side by
 * played_at (then create_time) desc — newest first.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import type { Game } from '../types';

export function useGames() {
  return useQuery({
    queryKey: queryKeys.module('minigolf').list(),
    queryFn: async (): Promise<Game[]> => {
      const games = await aepbase.list<Game>(AepCollections.GAMES);
      return games.sort((a, b) => {
        const aKey = a.played_at || a.create_time || '';
        const bKey = b.played_at || b.create_time || '';
        return bKey.localeCompare(aKey);
      });
    },
  });
}
