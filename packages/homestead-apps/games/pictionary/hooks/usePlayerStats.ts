/**
 * Aggregate per-player stats across every Pictionary game. Walks each
 * game's teams in parallel via `useQueries` — same query key shape as
 * `useGameWinners` / `useGameTeams` so cache entries are shared.
 *
 * A player counts as having "played" a game when they appear in any
 * team's `players[]` for that game (de-duplicated, in case the roster
 * lists them twice). A player counts as a "win" when they appear in the
 * team whose `won === true`.
 */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PICTIONARY_GAMES, PICTIONARY_TEAMS } from '../resources';
import { useGames } from './useGames';
import type { PictionaryTeam } from '../types';

export interface PlayerStats {
  /** Player resource path, e.g. `"people/abc123"`. */
  playerPath: string;
  wins: number;
  gamesPlayed: number;
  /** Wins / gamesPlayed, in [0, 1]. */
  winRate: number;
}

interface UsePlayerStatsResult {
  data: PlayerStats[];
  isLoading: boolean;
  isError: boolean;
  /** The first failed read (the games list, or a game's teams). */
  error: Error | null;
  /** Retries every failed read. */
  refetch: () => void;
}

export function usePlayerStats(): UsePlayerStatsResult {
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

  const data = useMemo<PlayerStats[]>(() => {
    if (gamesLoading || childrenLoading) return [];

    const wins = new Map<string, number>();
    const played = new Map<string, number>();

    teamQueries.forEach((query) => {
      const teams = query.data;
      if (!teams) return;

      const playersThisGame = new Set<string>();
      for (const team of teams) {
        for (const p of team.players) {
          playersThisGame.add(p);
        }
      }
      for (const p of playersThisGame) {
        played.set(p, (played.get(p) ?? 0) + 1);
      }

      const winningTeam = teams.find((t) => t.won === true);
      if (winningTeam) {
        const winnersThisGame = new Set(winningTeam.players);
        for (const p of winnersThisGame) {
          wins.set(p, (wins.get(p) ?? 0) + 1);
        }
      }
    });

    const stats: PlayerStats[] = [];
    for (const [playerPath, gamesPlayed] of played.entries()) {
      const w = wins.get(playerPath) ?? 0;
      stats.push({
        playerPath,
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
