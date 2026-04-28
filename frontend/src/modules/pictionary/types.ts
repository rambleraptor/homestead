/**
 * Pictionary module types
 *
 * A Pictionary game session has a set of teams. Each team has a roster
 * of players (stored as `people/{id}` resource paths) and a `won` flag
 * marking the winning team. The `winning_word` lives on the game record
 * because it's a property of the round, not of the team. Teams are
 * unnamed — they're identified positionally by `rank`.
 */

export interface PictionaryGame {
  id: string;
  path: string;
  played_at: string;
  location?: string;
  winning_word?: string;
  notes?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

export interface PictionaryTeam {
  id: string;
  path: string; // pictionary-games/{gameId}/pictionary-teams/{id}
  /** Player resource paths: `["people/{id}", ...]` */
  players: string[];
  won?: boolean;
  rank?: number;
  created_by?: string;
  create_time: string;
  update_time: string;
}

/** Form payload for one team, used inside the game form. */
export interface PictionaryTeamFormData {
  /** Present when editing an existing team; omitted for newly added rows. */
  id?: string;
  players: string[];
  won: boolean;
  rank?: number;
}

/** Form payload for the whole game (game record + nested teams). */
export interface PictionaryGameFormData {
  played_at: string;
  location?: string;
  winning_word?: string;
  notes?: string;
  teams: PictionaryTeamFormData[];
}
