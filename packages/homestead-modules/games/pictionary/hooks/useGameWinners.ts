/**
 * Fetch the winning team for each game in `gameIds`. Teams live under the
 * game in aepbase (`/pictionary-games/{id}/pictionary-teams`), so we run
 * one list request per game in parallel via `useQueries` and reduce to a
 * { gameId -> winningTeam } map. Reuses the same query keys as
 * `useGameTeams` so detail-view fetches share the cache.
 */

import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import type { PictionaryTeam } from '../types';

export function useGameWinners(
  gameIds: string[],
): Record<string, PictionaryTeam | undefined> {
  const results = useQueries({
    queries: gameIds.map((gameId) => ({
      queryKey: [
        ...queryKeys.module('pictionary').all(),
        'teams',
        gameId,
      ],
      queryFn: async (): Promise<PictionaryTeam[]> => {
        return aepbase.list<PictionaryTeam>(
          AepCollections.PICTIONARY_TEAMS,
          { parent: [AepCollections.PICTIONARY_GAMES, gameId] },
        );
      },
      enabled: !!gameId,
    })),
  });

  const winners: Record<string, PictionaryTeam | undefined> = {};
  gameIds.forEach((id, i) => {
    const teams = results[i]?.data;
    if (teams) winners[id] = teams.find((t) => t.won === true);
  });
  return winners;
}
