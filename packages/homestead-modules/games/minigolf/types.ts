/**
 * Minigolf module types
 *
 * Players are stored as aepbase resource paths in the form `people/{id}`
 * so scores don't break when a person is renamed.
 */

/** A single player's strokes for a hole. `player` is `people/{id}`. */
export interface PlayerScore {
  player: string;
  strokes: number;
}

export interface Game {
  id: string;
  path: string;
  location?: string;
  played_at?: string;
  /** Player resource paths: `["people/{id}", ...]` */
  players: string[];
  hole_count: number;
  completed?: boolean;
  notes?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

export interface GameFormData {
  location?: string;
  played_at?: string;
  /** Player resource paths: `["people/{id}", ...]` */
  players: string[];
  hole_count: number;
}

export interface Hole {
  id: string;
  path: string; // games/{gameId}/holes/{id}
  hole_number: number;
  par: number;
  scores: PlayerScore[];
  created_by?: string;
  create_time: string;
  update_time: string;
}

export interface HoleFormData {
  hole_number: number;
  par: number;
  scores: PlayerScore[];
}
