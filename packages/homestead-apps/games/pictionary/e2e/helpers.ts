/**
 * Pictionary E2E helpers — seed games + their child teams via the aepbase
 * REST API.
 */

import { e2eClient } from '../../../../../tests/e2e/utils/aepbase-helpers';

export interface CreatePictionaryTeamInput {
  players: string[];
  won?: boolean;
  rank?: number;
}

export interface CreatePictionaryGameInput {
  played_at?: string;
  location?: string;
  winning_word?: string;
  notes?: string;
  teams: CreatePictionaryTeamInput[];
}

export interface PictionaryGameRecord {
  id: string;
  played_at: string;
  location?: string;
  winning_word?: string;
  notes?: string;
}

export interface PictionaryTeamRecord {
  id: string;
  players: string[];
  won?: boolean;
  rank?: number;
}

export async function createPictionaryGame(
  token: string,
  data: CreatePictionaryGameInput,
): Promise<{
  game: PictionaryGameRecord;
  teams: PictionaryTeamRecord[];
}> {
  const hs = e2eClient(token);
  const game = await hs.collection<PictionaryGameRecord>('pictionary-games').create({
    played_at: data.played_at || new Date().toISOString(),
    location: data.location,
    winning_word: data.winning_word,
    notes: data.notes,
  });
  const teamsCollection = hs
    .collection('pictionary-games')
    .record(game.id)
    .collection<PictionaryTeamRecord>('pictionary-teams');
  const teams: PictionaryTeamRecord[] = [];
  for (let i = 0; i < data.teams.length; i++) {
    const team = data.teams[i];
    const created = await teamsCollection.create({
      players: team.players,
      won: team.won ?? false,
      rank: team.rank ?? i + 1,
    });
    teams.push(created);
  }
  return { game, teams };
}

