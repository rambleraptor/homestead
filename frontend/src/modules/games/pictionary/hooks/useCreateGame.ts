/**
 * Create a Pictionary game and its teams in one mutation.
 *
 * Server-side ordering: the game record is created first so we have an
 * id for the team URLs; teams are then created in parallel since they
 * have no inter-dependency.
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

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

function teamPayload(
  team: PictionaryTeamFormData,
  index: number,
  createdBy: string | undefined,
): Record<string, unknown> {
  return {
    players: team.players,
    won: team.won,
    rank: team.rank ?? index + 1,
    created_by: createdBy,
  };
}

export function useCreateGame() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PictionaryGameFormData): Promise<PictionaryGame> => {
      const createdBy = createdByPath();
      const game = await aepbase.create<PictionaryGame>(
        AepCollections.PICTIONARY_GAMES,
        {
          played_at: data.played_at || new Date().toISOString(),
          location: data.location,
          winning_word: data.winning_word,
          notes: data.notes,
          created_by: createdBy,
        },
      );

      await Promise.all(
        data.teams.map((team, index) =>
          aepbase.create<PictionaryTeam>(
            AepCollections.PICTIONARY_TEAMS,
            teamPayload(team, index, createdBy),
            { parent: [AepCollections.PICTIONARY_GAMES, game.id] },
          ),
        ),
      );

      return game;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('pictionary').all(),
      });
    },
    onError: (error) => {
      logger.error('Failed to create pictionary game', error);
    },
  });
}
