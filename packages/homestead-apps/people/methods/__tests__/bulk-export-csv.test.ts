import { describe, expect, it, vi } from 'vitest';
import type { BulkExportContext } from '@rambleraptor/homestead-core/resources/bulk-export/types';

// The source reads four collections through the server client; stub it so the
// test drives the join off seeded in-memory data rather than the engine.
const collections: Record<string, unknown[]> = {
  people: [
    { id: 'p1', name: 'Jane Doe' },
    { id: 'p2', name: 'John Doe' },
    { id: 'p3', name: 'Peter Jones' },
  ],
  addresses: [
    { id: 'a1', line1: '123 Main St', wifi_network: 'HomeWiFi', wifi_password: 'pw' },
  ],
  'person-shared-data': [
    { id: 's1', person_a: 'p1', person_b: 'p2', address_id: 'a1' },
  ],
  // Partner comes from the relationship row; a sibling link is not a partner.
  'person-relationships': [
    { id: 'r1', person_a: 'p1', person_b: 'p2', kind: 'partner' },
    { id: 'r2', person_a: 'p1', person_b: 'p3', kind: 'sibling' },
  ],
};

// Simulate the engine: an `id in ["x", ...]` filter narrows the rows to those
// ids. Everything else returns the whole collection.
const listAll = vi.fn(
  async (plural: string, opts?: { filter?: string }): Promise<{ id: string }[]> => {
    const rows = (collections[plural] ?? []) as { id: string }[];
    const filter = opts?.filter;
    if (typeof filter === 'string' && filter.startsWith('id in')) {
      const ids = [...filter.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      return rows.filter((r) => ids.includes(r.id));
    }
    return rows;
  },
);

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => ({
    collection: (plural: string) => ({
      listAll: (opts?: { filter?: string }) => listAll(plural, opts),
    }),
  }),
}));

const { source } = await import('../bulk-export-csv');

const ctx: BulkExportContext = {
  auth: { token: 't', user: { id: 'u', path: 'users/u', email: 'a@b.c' } },
  plural: 'people',
};

describe('people export source', () => {
  it('combines household members (shared address_id) into one row', async () => {
    const rows = await source({ ctx, options: { combine_households: true } });
    expect(rows).toEqual([
      {
        // Jane + John share address a1 → a single household row.
        name: 'Jane Doe & John Doe',
        address: '123 Main St',
        wifi_network: 'HomeWiFi',
        wifi_password: 'pw',
        partner_name: undefined,
      },
      {
        // Peter has no address → his own row.
        name: 'Peter Jones',
        address: undefined,
        wifi_network: undefined,
        wifi_password: undefined,
        partner_name: undefined,
      },
    ]);
  });

  it('combines within the selection — ticking one member shows only that one', async () => {
    const rows = await source({
      ctx,
      filter: 'id in ["p1"]',
      options: { combine_households: true },
    });
    expect(rows).toEqual([
      {
        name: 'Jane Doe',
        address: '123 Main St',
        wifi_network: 'HomeWiFi',
        wifi_password: 'pw',
        partner_name: undefined,
      },
    ]);
  });

  it('narrows to a selection filter, still resolving an out-of-selection partner', async () => {
    // Only Jane is selected (id in ["p1"]); her partner John is not — but his
    // name must still resolve, because names come from the unfiltered list.
    const rows = await source({ ctx, filter: 'id in ["p1"]' });
    expect(rows).toEqual([
      {
        name: 'Jane Doe',
        address: '123 Main St',
        wifi_network: 'HomeWiFi',
        wifi_password: 'pw',
        partner_name: 'John Doe',
      },
    ]);
  });

  it('flattens each person with their joined address and partner name', async () => {
    const rows = await source({ ctx });
    expect(rows).toEqual([
      {
        name: 'Jane Doe',
        address: '123 Main St',
        wifi_network: 'HomeWiFi',
        wifi_password: 'pw',
        partner_name: 'John Doe',
      },
      {
        // Shares the same address record and is the other half of the couple.
        name: 'John Doe',
        address: '123 Main St',
        wifi_network: 'HomeWiFi',
        wifi_password: 'pw',
        partner_name: 'Jane Doe',
      },
      {
        // No shared-data record: address and partner come back undefined.
        name: 'Peter Jones',
        address: undefined,
        wifi_network: undefined,
        wifi_password: undefined,
        partner_name: undefined,
      },
    ]);
  });
});
