/**
 * Gift Cards bulk import, on the VM tier.
 *
 * A port of ../e2e/gift-card-bulk-import.spec.ts. Covers both callers of the
 * same API: the standardized import page, and a direct REST call of the kind
 * the CLI makes. Each test boots from a fresh copy of the template database,
 * so there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient, postCustomMethod } from '../../../../tests/e2e/utils/aepbase-helpers';

interface GiftCardRow {
  id: string;
  merchant: string;
  amount: number;
  notes?: string;
  archived?: boolean;
}

interface OperationRow {
  id: string;
  done: boolean;
  response?: {
    dryRun: boolean;
    created?: number;
    failed?: Array<{ index: number; error: string }>;
    items?: Array<{ index: number; errors: string[] }>;
    summary: { total: number; valid: number; invalid: number };
  };
  error?: { message?: string };
}

const CSV = [
  'merchant,card_number,amount,pin,notes,archived',
  'Amazon,1234-5678,100.00,4321,Birthday gift,false',
  'Starbucks,9876-5432,25.50,,"For daily coffee runs",false',
  'Target,4455-6677,50.00,,,true',
  '',
].join('\n');

/** One row valid, one missing the required merchant. */
const MIXED_CSV = ['merchant,card_number,amount', 'Amazon,1234-5678,100.00', ',9999-0000,20.00', ''].join(
  '\n',
);

const toBase64 = (s: string) => Buffer.from(s).toString('base64');

/** Drive a bulk-import call to completion: 202 → poll the operation. */
async function bulkImport(
  token: string,
  body: Record<string, unknown>,
): Promise<OperationRow> {
  const res = await postCustomMethod(token, '/gift-cards:bulk-import', body);
  expect(res.status).toBe(202);
  const { id } = (await res.json()) as { id: string };

  const operations = e2eClient(token).collection<OperationRow>('operations');
  await expect
    .poll(async () => (await operations.get(id)).done, {
      timeout: 15_000,
    })
    .toBe(true);
  return operations.get(id);
}

describe('Gift Cards bulk import — API', () => {
  let h: Harness;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    userToken = h.member.token;
  });

  afterEach(async () => {
    await h.close();
  });

  test('a dry run reports rows without writing anything', async () => {
    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(CSV),
      filenames: ['cards.csv'],
      dryRun: true,
    });

    expect(operation.response?.dryRun).toBe(true);
    expect(operation.response?.summary).toEqual({ total: 3, valid: 3, invalid: 0 });
    expect(await e2eClient(userToken).collection<GiftCardRow>('gift-cards').listAll()).toHaveLength(0);
  });

  test('imports every valid row when selectedIndices is omitted', async () => {
    // The one-shot case: a CLI or script posts a file and gets everything
    // importable, with no preview round-trip.
    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(CSV),
    });

    expect(operation.response?.created).toBe(3);
    expect(operation.response?.failed).toEqual([]);

    const cards = await e2eClient(userToken).collection<GiftCardRow>('gift-cards').listAll();
    expect(cards.map((c) => c.merchant).sort()).toEqual(['Amazon', 'Starbucks', 'Target']);
    const amazon = cards.find((c) => c.merchant === 'Amazon');
    expect(amazon?.amount).toBe(100);
    expect(amazon?.notes).toBe('Birthday gift');
    expect(cards.find((c) => c.merchant === 'Target')?.archived).toBe(true);
  });

  test('imports only the selected rows', async () => {
    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(CSV),
      selectedIndices: [0, 2],
    });

    expect(operation.response?.created).toBe(2);
    const cards = await e2eClient(userToken).collection<GiftCardRow>('gift-cards').listAll();
    expect(cards.map((c) => c.merchant).sort()).toEqual(['Amazon', 'Target']);
  });

  test('skips invalid rows and imports the rest', async () => {
    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(MIXED_CSV),
    });

    expect(operation.response?.summary).toEqual({ total: 2, valid: 1, invalid: 1 });
    expect(operation.response?.created).toBe(1);
    expect(await e2eClient(userToken).collection<GiftCardRow>('gift-cards').listAll()).toHaveLength(1);
  });

  test('fails the operation when an invalid row is explicitly selected', async () => {
    // Silently skipping it would report "imported 0" with no reason why.
    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(MIXED_CSV),
      selectedIndices: [1],
    });

    expect(operation.error?.message).toContain('index 1 has errors');
    expect(await e2eClient(userToken).collection<GiftCardRow>('gift-cards').listAll()).toHaveLength(0);
  });

  test('rejects an unknown format up front, with no operation created', async () => {
    // AEP-151: an error that stops the operation from starting is an ordinary
    // error response, not a 202 followed by a failed operation.
    const before = await e2eClient(userToken).collection<OperationRow>('operations').listAll();
    const res = await postCustomMethod(userToken, '/gift-cards:bulk-import', {
      format: 'nonsense',
      data: toBase64(CSV),
    });

    expect(res.status).toBe(400);
    expect(await e2eClient(userToken).collection<OperationRow>('operations').listAll()).toHaveLength(before.length);
  });

  test('advertises its formats for discovery', async () => {
    // This is what the import page reads to build its format picker, and what
    // the CLI reads to list the verb.
    const res = await fetch('/api/custom-methods');
    const { methods } = (await res.json()) as {
      methods: Array<{
        plural: string;
        verb: string;
        async: boolean;
        bulkImport?: {
          formats: Array<{
            id: string;
            accept?: string;
            columns?: Array<{ name: string; required: boolean; description?: string }>;
          }>;
        };
      }>;
    };

    const method = methods.find((m) => m.plural === 'gift-cards' && m.verb === 'bulk-import');
    expect(method).toBeDefined();
    expect(method?.async).toBe(true);
    expect(method?.bulkImport?.formats.map((f) => f.id)).toEqual(['csv']);
    expect(method?.bulkImport?.formats[0].accept).toBe('.csv');

    // The column docs the page renders come from the parser's schema, so an app
    // describes a column once, next to the validator that enforces it.
    const columns = method?.bulkImport?.formats[0].columns;
    expect(columns?.filter((c) => c.required).map((c) => c.name)).toEqual([
      'merchant',
      'card_number',
      'amount',
    ]);
    expect(columns?.find((c) => c.name === 'amount')?.description).toContain('balance');
  });

  test('serves a template that itself imports cleanly', async () => {
    // The old template's example rows didn't line up with its header, so anyone
    // who filled it in got a file that wouldn't import.
    const res = await fetch('/api/bulk-import/gift-cards/template?format=csv');
    expect(res.status).toBe(200);
    const template = await res.text();

    const operation = await bulkImport(userToken, {
      format: 'csv',
      data: toBase64(template),
      dryRun: true,
    });
    expect(operation.response?.summary.invalid).toBe(0);
    expect(operation.response?.summary.valid).toBeGreaterThan(0);
  });
});

describe('Gift Cards bulk import — page', () => {
  let h: Harness;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('previews a CSV, deselects a row, and imports the rest', async () => {
    await h.driver.goto('/gift-cards/import');

    await h.driver.getByTestId('bulk-import-file-input').setInputFiles({
      name: 'cards.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV),
    });
    await h.driver.getByTestId('bulk-import-preview-button').click();

    // The preview is the server's parse, arriving via an operation poll.
    await h.driver.expect(h.driver.getByTestId('import-button')).toBeVisible();
    await h.driver.expect(h.driver.getByTestId('import-button')).toContainText('Import 3');

    await h.driver.getByLabel('Select Starbucks gift card').uncheck();
    await h.driver.expect(h.driver.getByTestId('import-button')).toContainText('Import 2');

    await h.driver.getByTestId('import-button').click();
    await h.driver.waitForURL(/\/gift-cards$/);

    const cards = await e2eClient(userToken).collection<GiftCardRow>('gift-cards').listAll();
    expect(cards.map((c) => c.merchant).sort()).toEqual(['Amazon', 'Target']);
  });

  test('shows why an invalid row cannot be imported', async () => {
    await h.driver.goto('/gift-cards/import');

    await h.driver.getByTestId('bulk-import-file-input').setInputFiles({
      name: 'cards.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(MIXED_CSV),
    });
    await h.driver.getByTestId('bulk-import-preview-button').click();

    await h.driver.expect(h.driver.getByText('merchant is required')).toBeVisible();
    // Only the valid row is selectable.
    await h.driver.expect(h.driver.getByTestId('import-button')).toContainText('Import 1');
  });
});
