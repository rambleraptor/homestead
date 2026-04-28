/**
 * Field validators for the Pictionary CSV import.
 *
 * The teams live in `team_1`..`team_6` columns. Each cell is a
 * comma-separated list of player names. The winner column references a
 * team by its 1-based position (e.g. "1" picks the team in `team_1`).
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
  playerNames: string[];
}

function parseTeamCell(raw: string): ParsedTeamCell | { error: string } {
  const cell = raw.trim();
  if (!cell) return { error: 'empty team cell' };

  const playerNames = cell
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (playerNames.length === 0) {
    return { error: 'team has no players' };
  }

  return { playerNames };
}

/**
 * Validator factory for one team_N column. The first two columns are
 * required (a Pictionary game needs ≥2 teams); columns 3-6 are optional.
 *
 * Returns the parsed team OR `null` for an empty optional column.
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
 * The winner column names a team by its 1-based position. We confirm
 * the position is in range and that the corresponding team_N column has
 * players.
 */
export const validateWinner: FieldValidator<number | undefined> = (
  value,
  row,
) => {
  const raw = value.trim();
  if (!raw) return { value: undefined };

  const position = Number(raw);
  if (
    !Number.isInteger(position) ||
    position < 1 ||
    position > TEAM_COLUMNS.length
  ) {
    return {
      value: undefined,
      error: `winner must be a team position between 1 and ${TEAM_COLUMNS.length}`,
    };
  }

  const cellRaw = row[TEAM_COLUMNS[position - 1]]?.trim();
  if (!cellRaw) {
    return {
      value: undefined,
      error: `winner position ${position} has no team in this row`,
    };
  }
  return { value: position };
};
