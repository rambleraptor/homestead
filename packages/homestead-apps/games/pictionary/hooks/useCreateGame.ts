/**
 * Create a Pictionary game and its teams in one mutation.
 *
 * Server-side ordering: the game record is created first so we have an
 * id for the team URLs; teams are then created in parallel since they
 * have no inter-dependency.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PICTIONARY_GAMES, PICTIONARY_TEAMS } from '../resources';
import { buildGameData, buildGameFormData } from '../utils/formData';
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
      const payload = data.winning_word_image
        ? buildGameFormData({ data, createdBy })
        : buildGameData({ data, createdBy });
      const game = await aepbase.create<PictionaryGame>(
        PICTIONARY_GAMES,
        payload,
      );

      await Promise.all(
        data.teams.map((team, index) =>
          aepbase.create<PictionaryTeam>(
            PICTIONARY_TEAMS,
            teamPayload(team, index, createdBy),
            { parent: [PICTIONARY_GAMES, game.id] },
          ),
        ),
      );

      return game;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('pictionary').all(),
      });
    },
  });
}
