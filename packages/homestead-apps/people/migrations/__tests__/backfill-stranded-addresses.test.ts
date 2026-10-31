/**
 * Unit tests for the `people-backfill-stranded-addresses` migration: addresses
 * `people-backfill-households` skipped become member-less households, ones it
 * covered are left alone, and re-runs create nothing.
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

import migrate from '../backfill-stranded-addresses';
import backfillHouseholds from '../backfill-households';

function ctx(): MigrationContext {
  return { id: 'people-backfill-stranded-addresses', token: 'admin', log: async () => {} };
}

beforeEach(() => {
  for (const key of Object.keys(h.state)) delete h.state[key];
  h.created.length = 0;
  h.state.people = [
    { id: 'p1', name: 'Ann' },
    { id: 'p2', name: 'Bob' },
  ];
});

describe('people-backfill-stranded-addresses migration', () => {
  test('keeps an address no shared-data row claims as a member-less household', async () => {
    h.state.addresses = [
      {
        id: 'a1',
        line1: ' 12 Oak St ',
        city: 'Springfield',
        wifi_network: 'Oak',
        wifi_password: 'pw',
        created_by: 'users/u1',
      },
    ];

    const result = await migrate(ctx());

    expect(h.created).toEqual([
      {
        name: '12 Oak St',
        members: [],
        line1: '12 Oak St',
        line2: undefined,
        city: 'Springfield',
        state: undefined,
        postal_code: undefined,
        country: undefined,
        wifi_network: 'Oak',
        wifi_password: 'pw',
        created_by: 'users/u1',
      },
    ]);
    expect(result).toMatchObject({ scanned: 1, stranded: 1, created: 1, skipped: 0 });
  });

  test('picks up addresses pointing at a missing row or a row with no people left', async () => {
    h.state['person-shared-data'] = [{ id: 's1', person_a: 'gone', address_id: 'a1' }];
    h.state.addresses = [
      { id: 'a1', line1: '1 Main St' },
      { id: 'a2', line1: '9 Lake Rd', shared_data_id: 's1' },
      { id: 'a3', city: 'Duluth', shared_data_id: 'missing' },
    ];

    await migrate(ctx());

    expect(h.created.map((c) => [c.name, c.members])).toEqual([
      ['1 Main St', []],
      ['9 Lake Rd', []],
      ['Duluth', []],
    ]);
  });

  test("leaves addresses the households backfill covered, primary and extra", async () => {
    h.state['person-shared-data'] = [{ id: 's1', person_a: 'p1', person_b: 'p2', address_id: 'a1' }];
    h.state.addresses = [
      { id: 'a1', line1: '1 Main St' },
      { id: 'a2', line1: '9 Lake Rd', shared_data_id: 's1' },
      { id: 'a3', line1: '5 Elm St' },
    ];

    await backfillHouseholds({ ...ctx(), id: 'people-backfill-households' });
    h.created.length = 0;
    const result = await migrate(ctx());

    expect(h.created.map((c) => c.line1)).toEqual(['5 Elm St']);
    expect(result).toMatchObject({ scanned: 3, stranded: 1, created: 1 });
  });

  test('skips blank addresses and ones already on a household', async () => {
    h.state.addresses = [
      { id: 'a1', line1: '  ' },
      { id: 'a2', line1: '1 Main St' },
    ];
    h.state.households = [{ id: 'h1', name: 'Ann', members: ['p1'], line1: '1 Main St' }];

    const result = await migrate(ctx());

    expect(h.created).toEqual([]);
    expect(result).toMatchObject({ created: 0, skipped: 2 });
  });

  test('a second run creates nothing', async () => {
    h.state.addresses = [{ id: 'a1', line1: '1 Main St' }];

    await migrate(ctx());
    const second = await migrate(ctx());

    expect(h.created).toHaveLength(1);
    expect(second).toMatchObject({ created: 0, skipped: 1 });
  });
});
