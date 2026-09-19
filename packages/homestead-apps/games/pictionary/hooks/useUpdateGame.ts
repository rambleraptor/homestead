/**
 * Update a Pictionary game and reconcile its team set.
 *
 * Reconciliation strategy: the form passes the desired team list. Teams
 * in the existing record but not the new list are deleted, teams with
 * an `id` are patched, and teams without an `id` are created.
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
      const payload = data.winning_word_image
        ? buildGameFormData({ data })
        : buildGameData({ data, clearMissing: true });
      const game = await aepbase.update<PictionaryGame>(
        PICTIONARY_GAMES,
        id,
        payload,
      );

      const keptIds = new Set(
        data.teams.map((t) => t.id).filter((x): x is string => !!x),
      );
      const parent = [PICTIONARY_GAMES, id];

      const deletions = existingTeams
        .filter((t) => !keptIds.has(t.id))
        .map((t) =>
          aepbase.remove(PICTIONARY_TEAMS, t.id, { parent }),
        );

      const upserts = data.teams.map((team, index) => {
        if (team.id) {
          return aepbase.update<PictionaryTeam>(
            PICTIONARY_TEAMS,
            team.id,
            teamPayload(team, index),
            { parent },
          );
        }
        return aepbase.create<PictionaryTeam>(
          PICTIONARY_TEAMS,
          teamPayload(team, index),
          { parent },
        );
      });

      await Promise.all([...deletions, ...upserts]);
      return game;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('pictionary').all(),
      });
    },
  });
}
