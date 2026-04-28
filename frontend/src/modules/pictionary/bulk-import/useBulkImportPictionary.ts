/**
 * Bulk-import hook for the Pictionary module.
 *
 * One CSV row → one game record + N team child records. Uses the
 * generic framework's `saveItem` path so the loop / error tracking /
 * query invalidation are all reused. `prepare` runs once before the
 * first row and loads all People into a name → id map for player
 * resolution.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useBulkImport } from '@/shared/bulk-import';
import type { PictionaryGame, PictionaryTeam } from '../types';
import type { PictionaryGameCSVData, PictionaryTeamCSV } from './types';

interface PersonRecord {
  id: string;
  name: string;
}

type PeopleByName = Map<string, string>;

async function loadPeopleMap(): Promise<PeopleByName> {
  const people = await aepbase.list<PersonRecord>(AepCollections.PEOPLE);
  const map: PeopleByName = new Map();
  for (const p of people) {
    map.set(p.name.toLowerCase(), p.id);
  }
  return map;
}

function resolvePlayers(
  team: PictionaryTeamCSV,
  peopleByName: PeopleByName,
): string[] {
  const missing: string[] = [];
  const resolved: string[] = [];
  for (const name of team.playerNames) {
    const id = peopleByName.get(name.toLowerCase());
    if (!id) {
      missing.push(name);
    } else {
      resolved.push(`people/${id}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Team ${team.position} has unknown player(s): ${missing.join(', ')}`,
    );
  }
  return resolved;
}

export function useBulkImportPictionary() {
  return useBulkImport<PictionaryGameCSVData, PeopleByName>({
    queryKey: queryKeys.module('pictionary').all(),
    prepare: loadPeopleMap,
    saveItem: async (data, { ctx, createdBy }) => {
      // Resolve all players up front so we fail before creating the
      // game record if any name is unknown.
      const resolvedTeams = data.teams.map((team) => ({
        ...team,
        playerPaths: resolvePlayers(team, ctx),
      }));

      const game = await aepbase.create<PictionaryGame>(
        AepCollections.PICTIONARY_GAMES,
        {
          played_at: data.played_at,
          location: data.location,
          winning_word: data.winning_word,
          notes: data.notes,
          created_by: createdBy,
        },
      );

      await Promise.all(
        resolvedTeams.map((team) =>
          aepbase.create<PictionaryTeam>(
            AepCollections.PICTIONARY_TEAMS,
            {
              players: team.playerPaths,
              won: team.won,
              rank: team.position,
              created_by: createdBy,
            },
            { parent: [AepCollections.PICTIONARY_GAMES, game.id] },
          ),
        ),
      );
    },
  });
}
