/**
 * Parsed shape of one CSV row in the Pictionary bulk import.
 * Player names are kept as raw strings here and resolved to
 * `people/{id}` paths at save time. Teams are unnamed; the
 * `position` is the 1-based column index (team_1 → position 1).
 */
export interface PictionaryTeamCSV {
  position: number;
  playerNames: string[];
  won: boolean;
}

export interface PictionaryGameCSVData {
  played_at: string;
  location?: string;
  winning_word?: string;
  notes?: string;
  teams: PictionaryTeamCSV[];
}

export const TEAM_COLUMNS = [
  'team_1',
  'team_2',
  'team_3',
  'team_4',
  'team_5',
  'team_6',
] as const;

export type TeamColumn = (typeof TEAM_COLUMNS)[number];
