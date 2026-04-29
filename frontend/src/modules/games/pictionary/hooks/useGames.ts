/**
 * Pictionary games list. Sort newest-first by played_at, falling back
 * to create_time when played_at is missing.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { PictionaryGame } from '../types';

export function useGames() {
  return useQuery({
    queryKey: queryKeys.module('pictionary').list(),
    queryFn: async (): Promise<PictionaryGame[]> => {
      const games = await aepbase.list<PictionaryGame>(
        AepCollections.PICTIONARY_GAMES,
      );
      return games.sort((a, b) => {
        const aKey = a.played_at || a.create_time || '';
        const bKey = b.played_at || b.create_time || '';
        return bKey.localeCompare(aKey);
      });
    },
  });
}
