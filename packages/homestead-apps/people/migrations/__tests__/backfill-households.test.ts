/**
 * Unit tests for the `people-backfill-households` migration: every address on
 * a shared-data row becomes a household of that row's people, and re-runs
 * create nothing.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MigrationContext } from '@rambleraptor/homestead-core/apps/migrations';

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => {
  const state: Record<string, Row[]> = {};
  const created: Row[] = [];
  const fakeHs = {
    collection: (plural: string) => ({
      listAll: async () => state[plural] ?? [],
      create: async (body: Row) => {
        created.push(body);
        (state[plural] ??= []).push({ id: `new${created.length}`, ...body });
        return body;
      },
    }),
  };
  return { state, created, fakeHs };
});

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => h.fakeHs,
}));

import migrate from '../backfill-households';

function ctx(): MigrationContext {
  return { id: 'people-backfill-households', token: 'admin', log: async () => {} };
}

beforeEach(() => {
  for (const key of Object.keys(h.state)) delete h.state[key];
  h.created.length = 0;
  h.state.people = [
    { id: 'p1', name: 'Ann' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Cat' },
  ];
});

describe('people-backfill-households migration', () => {
  test("turns a couple's primary address into one household named after them", async () => {
    h.state['person-shared-data'] = [
      { id: 's1', person_a: 'p1', person_b: 'p2', address_id: 'a1', created_by: 'users/u1' },
    ];
    h.state.addresses = [
      { id: 'a1', line1: '1 Main St', wifi_network: 'Home', wifi_password: 'pw' },
    ];

    const result = await migrate(ctx());

    expect(h.created).toEqual([
      {
        name: 'Ann & Bob',
        members: ['p1', 'p2'],
        line1: '1 Main St',
        line2: undefined,
        city: undefined,
        state: undefined,
        postal_code: undefined,
        country: undefined,
        wifi_network: 'Home',
        wifi_password: 'pw',
        created_by: 'users/u1',
      },
    ]);
    expect(result).toMatchObject({ scanned: 1, created: 1, skipped: 0 });
  });

  test('gives each extra address its own household with the same members', async () => {
    h.state['person-shared-data'] = [{ id: 's1', person_a: 'p3', address_id: 'a1' }];
    h.state.addresses = [
      { id: 'a1', line1: '1 Main St' },
      { id: 'a2', line1: '9 Lake Rd', shared_data_id: 's1' },
    ];

    await migrate(ctx());

    expect(h.created.map((c) => [c.name, c.members, c.line1])).toEqual([
      ['Cat (1 Main St)', ['p3'], '1 Main St'],
      ['Cat (9 Lake Rd)', ['p3'], '9 Lake Rd'],
    ]);
  });

  test('skips rows with no address and drops members who no longer exist', async () => {
    h.state['person-shared-data'] = [
      { id: 's1', person_a: 'p1' },
      { id: 's2', person_a: 'people/p2', person_b: 'gone', address_id: 'a1' },
    ];
    h.state.addresses = [{ id: 'a1', line1: '1 Main St' }];

    const result = await migrate(ctx());

    expect(h.created.map((c) => c.members)).toEqual([['p2']]);
    expect(result).toMatchObject({ created: 1, skipped: 1 });
  });

  test('a second run creates nothing', async () => {
    h.state['person-shared-data'] = [{ id: 's1', person_a: 'p1', person_b: 'p2', address_id: 'a1' }];
    h.state.addresses = [{ id: 'a1', line1: '1 Main St' }];

    await migrate(ctx());
    const second = await migrate(ctx());

    expect(h.created).toHaveLength(1);
    expect(second).toMatchObject({ created: 0, skipped: 1 });
  });
});
