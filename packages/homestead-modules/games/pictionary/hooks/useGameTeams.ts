/**
 * Teams list for a game. Teams live at
 * `/pictionary-games/{gameId}/pictionary-teams` — parent id is part of
 * the URL, not a stored field. Sorted by rank ascending (1 = best),
 * falling back to create_time so newly added rows stay in entry order.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import type { PictionaryTeam } from '../types';

export function useGameTeams(gameId: string | null) {
  return useQuery({
    queryKey: [
      ...queryKeys.module('pictionary').all(),
      'teams',
      gameId || '',
    ],
    queryFn: async (): Promise<PictionaryTeam[]> => {
      if (!gameId) return [];
      const teams = await aepbase.list<PictionaryTeam>(
        AepCollections.PICTIONARY_TEAMS,
        { parent: [AepCollections.PICTIONARY_GAMES, gameId] },
      );
      return teams.sort((a, b) => {
        const aRank = a.rank ?? Number.MAX_SAFE_INTEGER;
        const bRank = b.rank ?? Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return (a.create_time || '').localeCompare(b.create_time || '');
      });
    },
    enabled: !!gameId,
  });
}
