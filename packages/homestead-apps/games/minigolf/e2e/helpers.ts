/**
 * Minigolf E2E helpers — seed games (plural collection) via the aepbase
 * REST API.
 */

import { deleteIfPresent, e2eClient } from '../../../../../tests/e2e/utils/aepbase-helpers';

interface CreateGameInput {
  /** Player resource paths: `["people/{id}", ...]`. */
  players: string[];
  hole_count: number;
  location?: string;
  played_at?: string;
  completed?: boolean;
}

export interface GameRecord {
  id: string;
  players: string[];
  hole_count: number;
  location?: string;
  played_at?: string;
  completed?: boolean;
}

export async function createGame(
  token: string,
  data: CreateGameInput,
): Promise<GameRecord> {
  return e2eClient(token).collection<GameRecord>('games').create({
    players: data.players,
    hole_count: data.hole_count,
    location: data.location,
    played_at: data.played_at || new Date().toISOString(),
    completed: data.completed ?? false,
  });
}

