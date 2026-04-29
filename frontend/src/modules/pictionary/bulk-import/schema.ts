/**
 * Pictionary bulk import — CSV schema definition.
 *
 * Layout: a row per game with 4 game-level fields, 6 team columns
 * (`team_1`..`team_6`, only the first two required, each holding
 * comma-separated player names), and a `winner` column whose value is
 * the 1-based position of the winning team.
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

function buildTeamFieldDefs(
  peopleByName?: Map<string, string>,
): FieldConfig[] {
  return TEAM_COLUMNS.map((col, index) => ({
    name: col,
    required: index < 2,
    validator: makeTeamValidator(col, index < 2, peopleByName),
    description:
      index < 2
        ? `Team ${index + 1} as comma-separated player names (required)`
        : `Team ${index + 1} as comma-separated player names (optional)`,
  }));
}

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
    '"Alice,Bob"',
    '"Charlie,Dave"',
    '',
    '',
    '',
    '',
    '1',
  ].join(',');
  const example2 = [
    '2026-04-26',
    'Kitchen',
    'eiffel tower',
    '',
    '"Eve"',
    '"Frank,Grace"',
    '"Heidi,Ivan"',
    '',
    '',
    '',
    '2',
  ].join(',');
  return `${headers}\n${example1}\n${example2}`;
}

/**
 * Factory so the team validators can be wired up with a people lookup
 * loaded asynchronously by the page. When `peopleByName` is omitted,
 * the schema still parses team cells but skips the people-existence
 * check (the save layer is the backstop).
 */
export function makePictionaryImportSchema(
  peopleByName?: Map<string, string>,
): BulkImportSchema<PictionaryGameCSVData> {
  const teamFieldDefs = buildTeamFieldDefs(peopleByName);
  return {
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
          '1-based position of the winning team (e.g. 1 for team_1)',
      },
    ],
    transformParsed: (raw) => {
      const teams: PictionaryTeamCSV[] = [];
      const winnerPosition = raw.winner as number | undefined;

      TEAM_COLUMNS.forEach((col, index) => {
        const cell = raw[col] as
          | { playerNames: string[] }
          | null
          | undefined;
        if (!cell) return;
        const position = index + 1;
        teams.push({
          position,
          playerNames: cell.playerNames,
          won: winnerPosition === position,
        });
      });

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
}
