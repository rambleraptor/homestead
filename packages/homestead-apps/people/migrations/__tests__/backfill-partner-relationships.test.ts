/**
 * Unit tests for the `people-backfill-partner-relationships` migration: every
 * paired shared-data record gets one partner row, and re-runs create nothing.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MigrationContext } from '@rambleraptor/homestead-core/apps/migrations';

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => {
  const state = { shared: [] as Row[], relationships: [] as Row[] };
  const created: Row[] = [];
  const fakeHs = {
    collection: (plural: string) => ({
      listAll: async () =>
        plural === 'person-shared-data' ? state.shared : state.relationships,
      create: async (body: Row) => {
        created.push(body);
        state.relationships.push({ id: `r${created.length}`, ...body });
        return body;
      },
    }),
  };
  return { state, created, fakeHs };
});

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => h.fakeHs,
}));

import migrate from '../backfill-partner-relationships';

function ctx(): MigrationContext {
  return { id: 'people-backfill-partner-relationships', token: 'admin', log: async () => {} };
}

beforeEach(() => {
  h.state.shared = [];
  h.state.relationships = [];
  h.created.length = 0;
});

describe('people-backfill-partner-relationships migration', () => {
  test('creates a partner row for each paired shared-data record', async () => {
    h.state.shared = [
      { id: 's1', person_a: 'p2', person_b: 'p1', created_by: 'users/u1' },
      { id: 's2', person_a: 'p3' }, // address only, no partner
    ];

    const result = await migrate(ctx());

    expect(h.created).toEqual([
      { kind: 'partner', person_a: 'p1', person_b: 'p2', created_by: 'users/u1' },
    ]);
    expect(result).toMatchObject({ scanned: 2, created: 1, skipped: 1 });
  });

  test('skips pairs that already have a partner row (idempotent)', async () => {
    h.state.shared = [{ id: 's1', person_a: 'p1', person_b: 'p2' }];
    h.state.relationships = [
      { id: 'r0', kind: 'partner', person_a: 'people/p2', person_b: 'people/p1' },
    ];

    const result = await migrate(ctx());

    expect(h.created).toEqual([]);
    expect(result).toMatchObject({ created: 0, skipped: 1 });
  });

  test('a second run creates nothing', async () => {
    h.state.shared = [{ id: 's1', person_a: 'p1', person_b: 'p2' }];

    await migrate(ctx());
    await migrate(ctx());

    expect(h.created).toHaveLength(1);
  });
});
