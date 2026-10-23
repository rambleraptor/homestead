/**
 * Pictionary bulk import, on the VM tier — a port of
 * ../e2e/pictionary-bulk-import.spec.ts (API-only; the server runs in-process).
 *
 * The framework's hardest case: one CSV row becomes a game *plus* a team child
 * per populated team column, and player names must resolve against the People
 * collection — which the parser does itself, so preview and import can't
 * disagree about who exists.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient, listOrEmpty, postCustomMethod } from '../../../../../tests/e2e/utils/aepbase-helpers';
import { createPerson } from '../../../people/e2e/helpers';

interface GameRow {
  id: string;
  played_at: string;
  location?: string;
  winning_word?: string;
}

interface TeamRow {
  id: string;
  players: string[];
  won?: boolean;
  rank: number;
}

interface OperationRow {
  id: string;
  done: boolean;
  response?: {
    created?: number;
    items?: Array<{ index: number; label?: string; errors: string[] }>;
    summary: { total: number; valid: number; invalid: number };
  };
  error?: { message?: string };
}

const HEADER = 'played_at,location,winning_word,notes,team_1,team_2,winner';

const toBase64 = (s: string) => Buffer.from(s).toString('base64');

async function bulkImport(
  token: string,
  body: Record<string, unknown>,
): Promise<OperationRow> {
  const res = await postCustomMethod(token, '/pictionary-games:bulk-import', body);
  expect(res.status).toBe(202);
  const { id } = (await res.json()) as { id: string };

  await expect
    .poll(async () => (await e2eClient(token).collection<OperationRow>('operations').get(id)).done, {
      timeout: 15_000,
    })
    .toBe(true);
  return e2eClient(token).collection<OperationRow>('operations').get(id);
}

describe('Pictionary bulk import', () => {
  let h: Harness;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    userToken = h.member.token;
  });

  afterEach(async () => {
    await h.close();
  });

  test('one row becomes a game plus its team children', async () => {
    await Promise.all(
      ['Alice', 'Bob', 'Charlie', 'Dave'].map((name) => createPerson(userToken, { name })),
    );

    const csv = [
      HEADER,
      '2026-04-25,Living Room,banana,Fun night,"Alice,Bob","Charlie,Dave",2',
      '',
    ].join('\n');

    const operation = await bulkImport(userToken, { format: 'csv', data: toBase64(csv) });
    expect(operation.response?.created).toBe(1);

    const games = await listOrEmpty<GameRow>(userToken, 'pictionary-games');
    expect(games).toHaveLength(1);
    expect(games[0].location).toBe('Living Room');
    expect(games[0].winning_word).toBe('banana');
    // A bare date is anchored to UTC midnight so it round-trips.
    expect(games[0].played_at).toBe('2026-04-25T00:00:00.000Z');

    const teams = await listOrEmpty<TeamRow>(userToken, 'pictionary-teams', {
      parent: ['pictionary-games', games[0].id],
    });
    expect(teams).toHaveLength(2);

    const byRank = [...teams].sort((a, b) => a.rank - b.rank);
    expect(byRank[0].players).toHaveLength(2);
    expect(byRank[0].won).toBe(false);
    // `winner: 2` names the team in team_2 by its 1-based position.
    expect(byRank[1].won).toBe(true);
  });

  test('reports unknown players at preview time, before anything is written', async () => {
    await createPerson(userToken, { name: 'Alice' });

    const csv = [HEADER, '2026-04-25,,,,"Alice,Nobody","Alice",1', ''].join('\n');
    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(csv),
      dryRun: true,
    });

    expect(operation.response?.summary).toEqual({ total: 1, valid: 0, invalid: 1 });
    expect(operation.response?.items?.[0].errors[0]).toContain('Nobody');
    expect(await listOrEmpty<GameRow>(userToken, 'pictionary-games')).toHaveLength(0);
  });

  test('rejects a row whose winner names a team the row has no players for', async () => {
    await Promise.all(['Alice', 'Bob'].map((name) => createPerson(userToken, { name })));

    // `winner: 3` is a legal position, but this file has no team_3 column.
    const csv = [HEADER, '2026-04-25,,,,"Alice","Bob",3', ''].join('\n');
    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(csv),
      dryRun: true,
    });

    expect(operation.response?.summary.invalid).toBe(1);
    expect(operation.response?.items?.[0].errors.join(' ')).toContain(
      'position 3 has no team in this row',
    );
  });

  test('rejects a winner position outside the six team columns', async () => {
    await Promise.all(['Alice', 'Bob'].map((name) => createPerson(userToken, { name })));

    const csv = [HEADER, '2026-04-25,,,,"Alice","Bob",9', ''].join('\n');
    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(csv),
      dryRun: true,
    });

    expect(operation.response?.summary.invalid).toBe(1);
    expect(operation.response?.items?.[0].errors.join(' ')).toContain('between 1 and 6');
  });
});
