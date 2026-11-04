/**
 * Aggregate per-team stats across every Pictionary game. A "team" here is
 * identified by its set of player paths, sorted so that the same roster
 * across games maps to one team regardless of position.
 *
 * Mirrors `usePlayerStats`: walks each game's teams in parallel via
 * `useQueries`, sharing the same query key shape as `useGameWinners` /
 * `useGameTeams` so cache entries are reused.
 */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PICTIONARY_GAMES, PICTIONARY_TEAMS } from '../resources';
import { useGames } from './useGames';
import type { PictionaryTeam } from '../types';

export interface TeamStats {
  /** Canonical key: sorted player paths joined by `|`. */
  teamKey: string;
  /** Sorted player paths, e.g. `["people/alice", "people/bob"]`. */
  playerPaths: string[];
  wins: number;
  gamesPlayed: number;
  /** Wins / gamesPlayed, in [0, 1]. */
  winRate: number;
}

interface UseTeamStatsResult {
  data: TeamStats[];
  isLoading: boolean;
  isError: boolean;
  /** The first failed read (the games list, or a game's teams). */
  error: Error | null;
  /** Retries every failed read. */
  refetch: () => void;
}

function canonicalKey(players: string[]): {
  key: string;
  sorted: string[];
} {
  const sorted = [...new Set(players)].sort();
  return { key: sorted.join('|'), sorted };
}

export function useTeamStats(): UseTeamStatsResult {
  const {
    data: games,
    isLoading: gamesLoading,
    isError: gamesError,
    error: gamesErrorObj,
    refetch: refetchGames,
  } = useGames();

  const gameIds = useMemo(() => (games ?? []).map((g) => g.id), [games]);

  const teamQueries = useQueries({
    queries: gameIds.map((gameId) => ({
      queryKey: [
        ...queryKeys.app('pictionary').all(),
        'teams',
        gameId,
      ],
      queryFn: async (): Promise<PictionaryTeam[]> => {
        return aepbase.list<PictionaryTeam>(PICTIONARY_TEAMS, {
          parent: [PICTIONARY_GAMES, gameId],
        });
      },
      enabled: !!gameId,
    })),
  });

  const childrenLoading = teamQueries.some((q) => q.isLoading);
  const childrenError = teamQueries.some((q) => q.isError);

  const data = useMemo<TeamStats[]>(() => {
    if (gamesLoading || childrenLoading) return [];

    const wins = new Map<string, number>();
    const played = new Map<string, number>();
    const playersByKey = new Map<string, string[]>();

    teamQueries.forEach((query) => {
      const teams = query.data;
      if (!teams) return;

      for (const team of teams) {
        if (team.players.length === 0) continue;
        const { key, sorted } = canonicalKey(team.players);
        playersByKey.set(key, sorted);
        played.set(key, (played.get(key) ?? 0) + 1);
        if (team.won === true) {
          wins.set(key, (wins.get(key) ?? 0) + 1);
        }
      }
    });

    const stats: TeamStats[] = [];
    for (const [key, gamesPlayed] of played.entries()) {
      const w = wins.get(key) ?? 0;
      stats.push({
        teamKey: key,
        playerPaths: playersByKey.get(key) ?? [],
        wins: w,
        gamesPlayed,
        winRate: gamesPlayed === 0 ? 0 : w / gamesPlayed,
      });
    }

    stats.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.gamesPlayed - a.gamesPlayed;
    });

    return stats;
  }, [gamesLoading, childrenLoading, teamQueries]);

  return {
    data,
    isLoading: gamesLoading || childrenLoading,
    isError: gamesError || childrenError,
    error: gamesErrorObj ?? teamQueries.find((q) => q.error)?.error ?? null,
    refetch: () => {
      if (gamesError) void refetchGames();
      teamQueries.forEach((q) => {
        if (q.isError) void q.refetch();
      });
    },
  };
}
