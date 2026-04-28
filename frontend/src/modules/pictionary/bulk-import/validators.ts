/**
 * Field validators for the Pictionary CSV import.
 *
 * The teams live in `team_1`..`team_6` columns (each cell formatted as
 * `Name:player1,player2`). The winner column references a team by name
 * and must match one of the filled team cells in the same row.
 */

import type { FieldValidator } from '@/shared/bulk-import';
import { TEAM_COLUMNS } from './types';

export const validatePlayedAt: FieldValidator<string> = (value) => {
  const raw = value.trim();
  if (!raw) {
    return { value: '', error: 'played_at is required' };
  }

  // Accept YYYY-MM-DD or full ISO. Anchor a bare date to UTC midnight
  // so the saved string round-trips cleanly.
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const candidate = isoDateOnly ? `${raw}T00:00:00Z` : raw;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    return {
      value: raw,
      error: 'played_at must be a date (YYYY-MM-DD or ISO 8601)',
    };
  }
  return { value: date.toISOString() };
};

export const validateLocation: FieldValidator<string | undefined> = (value) => {
  const v = value.trim();
  if (!v) return { value: undefined };
  if (v.length > 200) {
    return { value: v, error: 'location must be 200 characters or less' };
  }
  return { value: v };
};

export const validateWinningWord: FieldValidator<string | undefined> = (
  value,
) => {
  const v = value.trim();
  if (!v) return { value: undefined };
  if (v.length > 200) {
    return {
      value: v,
      error: 'winning_word must be 200 characters or less',
    };
  }
  return { value: v };
};

export const validateNotes: FieldValidator<string | undefined> = (value) => {
  const v = value.trim();
  if (!v) return { value: undefined };
  if (v.length > 2000) {
    return { value: v, error: 'notes must be 2000 characters or less' };
  }
  return { value: v };
};

interface ParsedTeamCell {
  name: string;
  playerNames: string[];
}

function parseTeamCell(raw: string): ParsedTeamCell | { error: string } {
  const cell = raw.trim();
  if (!cell) return { error: 'empty team cell' };

  const colonIdx = cell.indexOf(':');
  if (colonIdx === -1) {
    return { error: `expected "Name:player1,player2", got "${cell}"` };
  }

  const name = cell.slice(0, colonIdx).trim();
  const playersRaw = cell.slice(colonIdx + 1);

  if (!name) return { error: 'team name is required' };

  const playerNames = playersRaw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (playerNames.length === 0) {
    return { error: `team "${name}" has no players` };
  }

  return { name, playerNames };
}

/**
 * Validator factory for one team_N column. The first two columns are
 * required (a Pictionary game needs ≥2 teams); columns 3-6 are optional.
 *
 * Returns the parsed team OR `null` for an empty optional column. The
 * row-level winner validator reads these via the `row` arg to verify the
 * winner cell matches one of the filled teams.
 */
export function makeTeamValidator(
  columnName: string,
  required: boolean,
): FieldValidator<ParsedTeamCell | null> {
  return (value) => {
    const v = value.trim();
    if (!v) {
      if (required) {
        return { value: null, error: `${columnName} is required` };
      }
      return { value: null };
    }

    const parsed = parseTeamCell(v);
    if ('error' in parsed) {
      return { value: null, error: `${columnName}: ${parsed.error}` };
    }
    return { value: parsed };
  };
}

/**
 * The winner column names a team. We re-parse the team_N cells from the
 * row to confirm the winner matches one of them. (The framework runs
 * each field validator independently, so we can't rely on a previously
 * parsed `teams` value here.)
 */
export const validateWinner: FieldValidator<string | undefined> = (
  value,
  row,
) => {
  const winner = value.trim();
  if (!winner) return { value: undefined };

  const teamNames = new Set<string>();
  for (const col of TEAM_COLUMNS) {
    const cellRaw = row[col]?.trim();
    if (!cellRaw) continue;
    const parsed = parseTeamCell(cellRaw);
    if (!('error' in parsed)) {
      teamNames.add(parsed.name.toLowerCase());
    }
  }

  if (!teamNames.has(winner.toLowerCase())) {
    return {
      value: winner,
      error: `winner "${winner}" does not match any team in this row`,
    };
  }
  return { value: winner };
};
