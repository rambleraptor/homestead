/**
 * post_classify hook handlers: how a classified document's metadata maps onto
 * the HSA receipt / charitable receipt / recipe it creates. The shared
 * homestead-client is mocked, so these assert the body built for the downstream
 * resource and the returned link — the field coercions (date widening, enum
 * fallback, null-dropping) are what break.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeServerClient } from '@rambleraptor/homestead-core/server/__tests__/fake-server-client';
import type { Document } from '../../../types';

const fake = createFakeServerClient();
const serverClientTokens: string[] = [];
vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: (token: string) => {
    serverClientTokens.push(token);
    return fake.client;
  },
}));

const { createFn, listAllFn } = fake;

import medicalReceiptHook from '../medical-receipt.server';
import charitableReceiptHook from '../charitable-donation-receipt.server';
import recipeHook from '../recipe.server';
import immunizationRecordHook from '../immunization-record.server';

const auth = {
  token: 'tok',
  user: { id: 'u1', path: 'users/u1', email: 'a@b.c' },
};

const doc = (over: Partial<Document> = {}): Document => ({
  id: 'doc1',
  path: 'documents/doc1',
  title: 'A document',
  created_by: 'users/u1',
  create_time: '2026-01-02T03:04:05.000Z',
  ...over,
});

beforeEach(() => {
  createFn.mockReset();
  createFn.mockResolvedValue({ id: 'created1' });
  listAllFn.mockReset();
  listAllFn.mockResolvedValue([]); // no people to match unless a test says so
  serverClientTokens.length = 0;
});

describe('medical-receipt post_classify', () => {
  it('maps receipt metadata onto an hsa-receipt linked to the document', async () => {
    const result = await medicalReceiptHook({
      document: doc({ title: 'CVS receipt' }),
      metadata: {
        doc_type: 'medical-receipt',
        merchant: 'CVS Pharmacy',
        purchase_date: '2026-03-15',
        amount_paid: 42.5,
        category: 'Rx',
        patient: 'Jamie',
        items: 'Amoxicillin, dispensing fee',
        payment_method: 'card',
        tax: 0,
      },
      auth,
    });

    expect(createFn).toHaveBeenCalledTimes(1);
    const [path, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/hsa-receipts');
    expect(serverClientTokens).toContain('tok');
    expect(body).toMatchObject({
      merchant: 'CVS Pharmacy',
      service_date: '2026-03-15T00:00:00.000Z',
      amount: 42.5,
      category: 'Rx',
      status: 'Stored',
      patient: 'Jamie',
      source_document: 'documents/doc1',
      created_by: 'users/u1',
    });
    expect(body.notes).toContain('Items: Amoxicillin, dispensing fee');
    expect(body.notes).toContain('Paid by: card');
    expect(result).toEqual({ linked_resource: 'hsa-receipts/created1' });
  });

  it('links the receipt to a person on an unambiguous patient-name match', async () => {
    listAllFn.mockResolvedValue([
      { id: 'p1', name: 'Jamie', aliases: [] },
      { id: 'p2', name: 'Alex', aliases: ['Alexander'] },
    ]);

    await medicalReceiptHook({
      document: doc(),
      metadata: { doc_type: 'medical-receipt', patient: 'Jamie' },
      auth,
    });

    const [path, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/hsa-receipts');
    expect(serverClientTokens).toContain('tok');
    expect(listAllFn).toHaveBeenCalledWith('/people', undefined);
    expect(body.patient).toBe('Jamie');
    expect(body.person).toBe('people/p1');
  });

  it('matches a patient name against a person alias', async () => {
    listAllFn.mockResolvedValue([{ id: 'p2', name: 'Alex', aliases: ['Alexander'] }]);

    await medicalReceiptHook({
      document: doc(),
      metadata: { doc_type: 'medical-receipt', patient: 'alexander' },
      auth,
    });

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.person).toBe('people/p2');
  });

  it('leaves person unset when the patient name is ambiguous or unknown', async () => {
    listAllFn.mockResolvedValue([
      { id: 'p1', name: 'Jamie', aliases: [] },
      { id: 'p3', name: 'Jamie', aliases: [] }, // two people named Jamie → ambiguous
    ]);

    await medicalReceiptHook({
      document: doc(),
      metadata: { doc_type: 'medical-receipt', patient: 'Jamie' },
      auth,
    });

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.patient).toBe('Jamie');
    expect(body.person).toBeUndefined();
  });

  it('still creates the receipt when the people lookup fails', async () => {
    listAllFn.mockRejectedValue(new Error('boom'));

    await medicalReceiptHook({
      document: doc(),
      metadata: { doc_type: 'medical-receipt', patient: 'Jamie' },
      auth,
    });

    expect(createFn).toHaveBeenCalledTimes(1);
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.patient).toBe('Jamie');
    expect(body.person).toBeUndefined();
  });

  it('falls back to a valid category and the document date/title when absent', async () => {
    await medicalReceiptHook({
      document: doc({ title: 'Scan 001' }),
      metadata: { doc_type: 'medical-receipt', category: 'Wellness' },
      auth,
    });
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.category).toBe('Medical'); // 'Wellness' is not an HSA category
    expect(body.merchant).toBe('Scan 001'); // no merchant → document title
    expect(body.amount).toBe(0); // no amount → 0
    expect(body.service_date).toBe('2026-01-02T03:04:05.000Z'); // no date → doc create_time
  });
});

describe('charitable-donation-receipt post_classify', () => {
  it('maps an acknowledgment onto a charitable receipt linked to the document', async () => {
    const result = await charitableReceiptHook({
      document: doc({ title: 'Food bank letter' }),
      metadata: {
        doc_type: 'charitable-donation-receipt',
        organization_name: 'Food Bank',
        organization_ein: '12-3456789',
        donor_name: 'Jamie',
        donation_date: '2025-12-30',
        donation_amount: 250,
        goods_or_services: 'No goods or services were provided in exchange.',
        tax_year: 2025,
      },
      auth,
    });

    expect(createFn).toHaveBeenCalledTimes(1);
    const [path, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/charitable-receipts');
    expect(serverClientTokens).toContain('tok');
    expect(body).toMatchObject({
      organization: 'Food Bank',
      organization_ein: '12-3456789',
      donation_date: '2025-12-30T00:00:00.000Z',
      amount: 250,
      gift_type: 'Cash',
      tax_year: 2025,
      status: 'Unclaimed',
      donor: 'Jamie',
      source: 'Self',
      source_document: 'documents/doc1',
      created_by: 'users/u1',
    });
    expect(body.goods_or_services).toBe(
      'No goods or services were provided in exchange.',
    );
    expect(result).toEqual({ linked_resource: 'charitable-receipts/created1' });
  });

  it('marks a gift granted from a donor-advised fund as a DAF grant', async () => {
    await charitableReceiptHook({
      document: doc(),
      metadata: {
        doc_type: 'charitable-donation-receipt',
        organization_name: 'Food Bank',
        donation_amount: 500,
        donor_advised_fund: 'Fidelity Charitable',
      },
      auth,
    });

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.source).toBe('DAF');
  });

  it('leaves a gift of goods unvalued rather than inventing a deduction', async () => {
    await charitableReceiptHook({
      document: doc(),
      metadata: {
        doc_type: 'charitable-donation-receipt',
        organization_name: 'Shelter',
        description_of_property: '3 bags of clothing',
      },
      auth,
    });

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.gift_type).toBe('Goods');
    expect(body.description_of_property).toBe('3 bags of clothing');
    expect(body.amount).toBeUndefined();
  });

  it('calls a gift it cannot characterize Other', async () => {
    await charitableReceiptHook({
      document: doc(),
      metadata: {
        doc_type: 'charitable-donation-receipt',
        organization_name: 'Endowment',
      },
      auth,
    });

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.gift_type).toBe('Other');
  });

  it('links the donation to a person on an unambiguous donor-name match', async () => {
    listAllFn.mockResolvedValue([
      { id: 'p1', name: 'Jamie', aliases: [] },
      { id: 'p2', name: 'Alex', aliases: [] },
    ]);

    await charitableReceiptHook({
      document: doc(),
      metadata: {
        doc_type: 'charitable-donation-receipt',
        organization_name: 'Food Bank',
        donor_name: 'Jamie',
      },
      auth,
    });

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.donor).toBe('Jamie');
    expect(body.person).toBe('people/p1');
  });

  it('still creates the donation when the people lookup fails', async () => {
    listAllFn.mockRejectedValue(new Error('boom'));

    await charitableReceiptHook({
      document: doc(),
      metadata: {
        doc_type: 'charitable-donation-receipt',
        organization_name: 'Food Bank',
        donor_name: 'Jamie',
      },
      auth,
    });

    expect(createFn).toHaveBeenCalledTimes(1);
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.person).toBeUndefined();
  });

  it('falls back to the document title and date, and drops an implausible tax year', async () => {
    await charitableReceiptHook({
      document: doc({ title: 'Scan 002' }),
      metadata: { doc_type: 'charitable-donation-receipt', tax_year: 25 },
      auth,
    });

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.organization).toBe('Scan 002');
    expect(body.donation_date).toBe('2026-01-02T03:04:05.000Z');
    expect(body.tax_year).toBeUndefined();
  });
});

describe('recipe post_classify', () => {
  it('maps recipe metadata onto a recipe, dropping per-ingredient nulls', async () => {
    const result = await recipeHook({
      document: doc({ title: 'Banana bread' }),
      metadata: {
        doc_type: 'recipe',
        parsed_ingredients: [
          { item: 'flour', qty: 2, unit: 'cup', raw: '2 cups flour' },
          { item: 'salt', qty: null, unit: null, raw: 'a pinch of salt' },
        ],
        steps: ['Mix', 'Bake'],
        tags: ['dessert', null],
        prep_time: '10 mins',
        method: 'Grease the pan.',
      },
      auth,
    });

    expect(createFn).toHaveBeenCalledTimes(1);
    const [path, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/recipes');
    expect(body.title).toBe('Banana bread');
    expect(body.parsed_ingredients).toEqual([
      { item: 'flour', qty: 2, unit: 'cup', raw: '2 cups flour' },
      { item: 'salt', raw: 'a pinch of salt' }, // null qty/unit dropped
    ]);
    expect(body.steps).toEqual(['Mix', 'Bake']);
    expect(body.tags).toEqual(['dessert']); // null tag dropped
    expect(body.prep_time).toBe('10 mins');
    expect(body.method).toBe('Grease the pan.');
    expect(body.source_document).toBeUndefined();
    expect(body.source_pointer).toBe('documents/doc1'); // no printed source → back-link
    expect(result).toEqual({ linked_resource: 'recipes/created1' });
  });

  it('strips the "Recipe — " prefix the classify pass adds to the title', async () => {
    await recipeHook({
      document: doc({ title: 'Recipe — Banana Bread' }),
      metadata: { doc_type: 'recipe' },
      auth,
    });
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.title).toBe('Banana Bread');
  });

  it('strips a hyphen-separated recipe prefix too', async () => {
    await recipeHook({
      document: doc({ title: 'Recipe - Chocolate Chip Cookies' }),
      metadata: { doc_type: 'recipe' },
      auth,
    });
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.title).toBe('Chocolate Chip Cookies');
  });

  it('leaves a title without a recipe prefix unchanged', async () => {
    await recipeHook({
      document: doc({ title: 'Banana bread' }),
      metadata: { doc_type: 'recipe' },
      auth,
    });
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.title).toBe('Banana bread');
  });

  it('defaults required fields when the read is empty', async () => {
    await recipeHook({
      document: doc({ title: undefined }),
      metadata: { doc_type: 'recipe' },
      auth,
    });
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.title).toBe('Untitled recipe');
    expect(body.parsed_ingredients).toEqual([]);
  });
});

describe('immunization-record post_classify', () => {
  /** Route the single list/create spies by engine path: a vaccines index plus
   *  per-series dose lists, mirroring the nested `/vaccines/{id}/vaccinations`. */
  function seedHealth(
    vaccines: Array<{ id: string; name: string }>,
    dosesById: Record<string, Array<Record<string, unknown>>> = {},
  ) {
    listAllFn.mockImplementation(async (path: string) => {
      if (path === '/vaccines') return vaccines;
      const match = /^\/vaccines\/([^/]+)\/vaccinations$/.exec(path);
      if (match) return dosesById[match[1]!] ?? [];
      return [];
    });
    let nextId = 0;
    createFn.mockImplementation(async (_path: string, body: unknown) => ({
      id: `new${++nextId}`,
      ...(body as Record<string, unknown>),
    }));
  }

  it('creates the series and one vaccination per extracted dose', async () => {
    seedHealth([]);

    const result = await immunizationRecordHook({
      document: doc(),
      metadata: {
        doc_type: 'immunization-record',
        doses: [
          {
            vaccine: 'Tdap',
            date_administered: '2024-05-12',
            dose: 'booster',
            provider: 'CVS Pharmacy',
            lot_number: 'A123',
          },
          { vaccine: 'Influenza', date_administered: '2025-10-01' },
        ],
      },
      auth,
    });

    // Two series created, then a dose under each.
    const calls = createFn.mock.calls as Array<[string, Record<string, unknown>]>;
    expect(calls.map(([path]) => path)).toEqual([
      '/vaccines',
      '/vaccines/new1/vaccinations',
      '/vaccines',
      '/vaccines/new3/vaccinations',
    ]);
    expect(calls[0][1]).toEqual({ name: 'Tdap', created_by: 'users/u1' });
    expect(calls[1][1]).toEqual({
      date_administered: '2024-05-12',
      dose: 'booster',
      provider: 'CVS Pharmacy',
      lot_number: 'A123',
      document: 'doc1',
      created_by: 'users/u1',
    });
    expect(calls[3][1]).toMatchObject({
      date_administered: '2025-10-01',
      document: 'doc1',
    });
    // The pointer names the first touched series.
    expect(result).toEqual({ linked_resource: 'vaccines/new1' });
  });

  it('reuses an existing series, matching its name case-insensitively', async () => {
    seedHealth([{ id: 'v1', name: 'TDAP' }]);

    await immunizationRecordHook({
      document: doc(),
      metadata: {
        doc_type: 'immunization-record',
        doses: [{ vaccine: 'Tdap', date_administered: '2024-05-12' }],
      },
      auth,
    });

    const calls = createFn.mock.calls as Array<[string, Record<string, unknown>]>;
    expect(calls.map(([path]) => path)).toEqual(['/vaccines/v1/vaccinations']);
  });

  it('skips a dose this document already mirrored (same series + date)', async () => {
    seedHealth([{ id: 'v1', name: 'Tdap' }], {
      v1: [{ id: 'd1', date_administered: '2024-05-12', document: 'doc1' }],
    });

    const result = await immunizationRecordHook({
      document: doc(),
      metadata: {
        doc_type: 'immunization-record',
        doses: [
          { vaccine: 'Tdap', date_administered: '2024-05-12' }, // duplicate
          { vaccine: 'Tdap', date_administered: '2034-05-12' }, // new
        ],
      },
      auth,
    });

    const calls = createFn.mock.calls as Array<[string, Record<string, unknown>]>;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/vaccines/v1/vaccinations');
    expect(calls[0][1]).toMatchObject({ date_administered: '2034-05-12' });
    // Still linked: the duplicate proves the series is this document's.
    expect(result).toEqual({ linked_resource: 'vaccines/v1' });
  });

  it('falls back to the scalar summary fields when the doses array is empty', async () => {
    seedHealth([]);

    await immunizationRecordHook({
      document: doc(),
      metadata: {
        doc_type: 'immunization-record',
        doses: [],
        vaccine: 'MMR',
        date_administered: '2020-06-01',
        provider: 'County clinic',
      },
      auth,
    });

    const calls = createFn.mock.calls as Array<[string, Record<string, unknown>]>;
    expect(calls[0]).toEqual(['/vaccines', { name: 'MMR', created_by: 'users/u1' }]);
    expect(calls[1][1]).toMatchObject({
      date_administered: '2020-06-01',
      provider: 'County clinic',
      document: 'doc1',
    });
  });

  it('widens a non-ISO printed date and skips a dose with no readable date', async () => {
    seedHealth([]);

    await immunizationRecordHook({
      document: doc(),
      metadata: {
        doc_type: 'immunization-record',
        doses: [
          { vaccine: 'Hep B', date_administered: 'March 15, 2019' },
          { vaccine: 'Hep B', date_administered: 'sometime in childhood' },
        ],
      },
      auth,
    });

    const doseCalls = (createFn.mock.calls as Array<[string, Record<string, unknown>]>).filter(
      ([path]) => path.endsWith('/vaccinations'),
    );
    expect(doseCalls).toHaveLength(1);
    expect(doseCalls[0][1]).toMatchObject({ date_administered: '2019-03-15' });
  });

  it('creates nothing and returns void when nothing is extractable', async () => {
    seedHealth([]);

    const result = await immunizationRecordHook({
      document: doc(),
      metadata: { doc_type: 'immunization-record' },
      auth,
    });

    expect(createFn).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
