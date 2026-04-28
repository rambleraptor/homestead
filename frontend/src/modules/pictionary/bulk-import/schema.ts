/**
 * Pictionary bulk import — CSV schema definition.
 *
 * Layout: a row per game with 4 game-level fields, 6 team columns
 * (`team_1`..`team_6`, only the first two required), and a `winner`
 * column naming the winning team.
 */

import type { BulkImportSchema, FieldConfig } from '@/shared/bulk-import';
import { GamePreview } from './GamePreview';
import {
  validatePlayedAt,
  validateLocation,
  validateWinningWord,
  validateNotes,
  validateWinner,
  makeTeamValidator,
} from './validators';
import {
  type PictionaryGameCSVData,
  type PictionaryTeamCSV,
  TEAM_COLUMNS,
} from './types';

const teamFieldDefs: FieldConfig[] = TEAM_COLUMNS.map((col, index) => ({
  name: col,
  required: index < 2,
  validator: makeTeamValidator(col, index < 2),
  description:
    index < 2
      ? `Team ${index + 1} as "Name:player1,player2" (required)`
      : `Team ${index + 1} as "Name:player1,player2" (optional)`,
}));

function generateTemplate(): string {
  const headers = [
    'played_at',
    'location',
    'winning_word',
    'notes',
    ...TEAM_COLUMNS,
    'winner',
  ].join(',');
  const example1 = [
    '2026-04-25',
    'Living Room',
    'banana',
    'Fun night',
    '"Reds:Alice,Bob"',
    '"Blues:Charlie,Dave"',
    '',
    '',
    '',
    '',
    'Reds',
  ].join(',');
  const example2 = [
    '2026-04-26',
    'Kitchen',
    'eiffel tower',
    '',
    '"Sharks:Eve"',
    '"Otters:Frank,Grace"',
    '"Wolves:Heidi,Ivan"',
    '',
    '',
    '',
    'Otters',
  ].join(',');
  return `${headers}\n${example1}\n${example2}`;
}

export const pictionaryImportSchema: BulkImportSchema<PictionaryGameCSVData> = {
  requiredFields: [
    {
      name: 'played_at',
      required: true,
      validator: validatePlayedAt,
      description: 'Date the game was played (YYYY-MM-DD or ISO 8601)',
    },
    teamFieldDefs[0],
    teamFieldDefs[1],
  ],
  optionalFields: [
    {
      name: 'location',
      required: false,
      validator: validateLocation,
      description: 'Where the game was played (max 200 characters)',
    },
    {
      name: 'winning_word',
      required: false,
      validator: validateWinningWord,
      description: 'The winning word/prompt (max 200 characters)',
    },
    {
      name: 'notes',
      required: false,
      validator: validateNotes,
      description: 'Free-text notes (max 2000 characters)',
    },
    teamFieldDefs[2],
    teamFieldDefs[3],
    teamFieldDefs[4],
    teamFieldDefs[5],
    {
      name: 'winner',
      required: false,
      validator: validateWinner,
      description:
        'Name of the winning team — must match one of the team_N cells',
    },
  ],
  transformParsed: (raw) => {
    const teams: PictionaryTeamCSV[] = [];
    const winner = (raw.winner as string | undefined) ?? undefined;
    const winnerLower = winner?.toLowerCase();

    for (const col of TEAM_COLUMNS) {
      const cell = raw[col] as
        | { name: string; playerNames: string[] }
        | null
        | undefined;
      if (!cell) continue;
      teams.push({
        name: cell.name,
        playerNames: cell.playerNames,
        won: winnerLower !== undefined && cell.name.toLowerCase() === winnerLower,
      });
    }

    return {
      played_at: raw.played_at as string,
      location: raw.location as string | undefined,
      winning_word: raw.winning_word as string | undefined,
      notes: raw.notes as string | undefined,
      teams,
    };
  },
  generateTemplate,
  PreviewComponent: GamePreview,
};
