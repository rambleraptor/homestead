/**
 * Update a Pictionary game and reconcile its team set.
 *
 * Reconciliation strategy: the form passes the desired team list. Teams
 * in the existing record but not the new list are deleted, teams with
 * an `id` are patched, and teams without an `id` are created.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type {
  PictionaryGame,
  PictionaryGameFormData,
  PictionaryTeam,
  PictionaryTeamFormData,
} from '../types';

interface UpdateGameParams {
  id: string;
  data: PictionaryGameFormData;
  /** Existing teams loaded into the form, used to compute deletes/updates. */
  existingTeams: PictionaryTeam[];
}

function teamPayload(
  team: PictionaryTeamFormData,
  index: number,
): Record<string, unknown> {
  return {
    players: team.players,
    won: team.won,
    rank: team.rank ?? index + 1,
  };
}

export function useUpdateGame() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
      existingTeams,
    }: UpdateGameParams): Promise<PictionaryGame> => {
      const game = await aepbase.update<PictionaryGame>(
        AepCollections.PICTIONARY_GAMES,
        id,
        {
          played_at: data.played_at,
          location: data.location ?? null,
          winning_word: data.winning_word ?? null,
          notes: data.notes ?? null,
        },
      );

      const keptIds = new Set(
        data.teams.map((t) => t.id).filter((x): x is string => !!x),
      );
      const parent = [AepCollections.PICTIONARY_GAMES, id];

      const deletions = existingTeams
        .filter((t) => !keptIds.has(t.id))
        .map((t) =>
          aepbase.remove(AepCollections.PICTIONARY_TEAMS, t.id, { parent }),
        );

      const upserts = data.teams.map((team, index) => {
        if (team.id) {
          return aepbase.update<PictionaryTeam>(
            AepCollections.PICTIONARY_TEAMS,
            team.id,
            teamPayload(team, index),
            { parent },
          );
        }
        return aepbase.create<PictionaryTeam>(
          AepCollections.PICTIONARY_TEAMS,
          teamPayload(team, index),
          { parent },
        );
      });

      await Promise.all([...deletions, ...upserts]);
      return game;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('pictionary').all(),
      });
    },
    onError: (error) => {
      logger.error('Failed to update pictionary game', error);
    },
  });
}
