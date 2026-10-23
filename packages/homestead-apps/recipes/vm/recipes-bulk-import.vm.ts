/**
 * Recipes bulk import, on the VM tier.
 *
 * A port of the Playwright recipes-bulk-import spec. Recipes is the
 * multi-format case: pasted text and Paprika archives, both behind the same
 * `recipes:bulk-import` verb.
 *
 * Everything runs as the superuser, matching the other recipes specs: the app's
 * `enabled` flag defaults to 'superusers', so a regular user is gated out of
 * writing recipes at all. Each test boots from a fresh database.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { getAppUrl } from '../../../../tests/e2e/config/aepbase.setup';
import { e2eClient, listOrEmpty, postCustomMethod } from '../../../../tests/e2e/utils/aepbase-helpers';
import type { RecipeRecord } from '../e2e/helpers';

/** Long enough for the operation poll below (15s) plus the boot. */
const BULK_IMPORT_TIMEOUT_MS = 30_000;

interface OperationRow {
  id: string;
  done: boolean;
  response?: {
    dryRun: boolean;
    created?: number;
    items?: Array<{ index: number; label?: string; errors: string[] }>;
    summary: { total: number; valid: number; invalid: number };
  };
  error?: { message?: string };
}

const RECIPE_TEXT = [
  'Bacon Wrapped Asparagus',
  '',
  'Ingredients:',
  '1 pound asparagus, trimmed',
  '8 strips thick-cut bacon',
  '',
  'Directions:',
  'Preheat the oven to 400 degrees F.',
  'Bake until the bacon is crisp.',
  '',
  'Source: https://www.wellplated.com/bacon-wrapped-asparagus/',
].join('\n');

const paprikaJson = (name: string) => ({
  name,
  source: 'wellplated.com',
  source_url: 'https://example.com/recipe',
  ingredients: '1 pound asparagus spears trimmed\n1 tablespoon extra-virgin olive oil',
  directions: 'Preheat the oven.\n\nBake until crisp.',
  prep_time: '10 mins',
  cook_time: '25 mins',
  servings: '4 servings',
  categories: ['Sides'],
});

/** Gzip a string the way a real `.paprikarecipe` file is encoded. */
async function gzip(text: string): Promise<Buffer> {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  const buf = await new Response(source.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return Buffer.from(buf);
}

async function bulkImport(
  token: string,
  body: Record<string, unknown>,
): Promise<OperationRow> {
  const res = await postCustomMethod(token, '/recipes:bulk-import', body);
  expect(res.status).toBe(202);
  const { id } = (await res.json()) as { id: string };

  await expect
    .poll(async () => (await e2eClient(token).collection<OperationRow>('operations').get(id)).done, {
      timeout: 15_000,
    })
    .toBe(true);
  return e2eClient(token).collection<OperationRow>('operations').get(id);
}

describe('Recipes bulk import — API', () => {
  let h: Harness;
  let adminToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: adminToken } = await h.loginAs(h.admin));
  });

  afterEach(async () => {
    await h.close();
  });

  test('imports a recipe pasted as text', { timeout: BULK_IMPORT_TIMEOUT_MS }, async () => {
    const operation = await bulkImport(adminToken, { format: 'text', text: RECIPE_TEXT });

    expect(operation.response?.created).toBe(1);
    const recipes = await listOrEmpty<RecipeRecord>(adminToken, 'recipes');
    expect(recipes).toHaveLength(1);
    expect(recipes[0].title).toBe('Bacon Wrapped Asparagus');
    expect(recipes[0].parsed_ingredients.length).toBeGreaterThan(0);
    expect(recipes[0].steps?.length).toBeGreaterThan(0);
  });

  test('imports a gzipped Paprika recipe', { timeout: BULK_IMPORT_TIMEOUT_MS }, async () => {
    const file = await gzip(JSON.stringify(paprikaJson('Bacon Wrapped Asparagus')));
    const operation = await bulkImport(adminToken, {
      format: 'paprika',
      data: file.toString('base64'),
      filenames: ['asparagus.paprikarecipe'],
    });

    expect(operation.response?.created).toBe(1);
    const recipes = await listOrEmpty<RecipeRecord>(adminToken, 'recipes');
    expect(recipes[0].title).toBe('Bacon Wrapped Asparagus');
    expect(recipes[0].prep_time).toBe('10 mins');
  });

  test('imports several Paprika files in one call', { timeout: BULK_IMPORT_TIMEOUT_MS }, async () => {
    const [a, b] = await Promise.all([
      gzip(JSON.stringify(paprikaJson('Recipe A'))),
      gzip(JSON.stringify(paprikaJson('Recipe B'))),
    ]);

    const operation = await bulkImport(adminToken, {
      format: 'paprika',
      data: [a.toString('base64'), b.toString('base64')],
      filenames: ['a.paprikarecipe', 'b.paprikarecipe'],
    });

    expect(operation.response?.created).toBe(2);
    const recipes = await listOrEmpty<RecipeRecord>(adminToken, 'recipes');
    expect(recipes.map((r) => r.title).sort()).toEqual(['Recipe A', 'Recipe B']);
  });

  test(
    'one unreadable file does not stop its siblings importing',
    { timeout: BULK_IMPORT_TIMEOUT_MS },
    async () => {
      // The whole point of reporting problems per item rather than throwing.
      const good = await gzip(JSON.stringify(paprikaJson('Recipe A')));
      const operation = await bulkImport(adminToken, {
        format: 'paprika',
        data: [Buffer.from('not a paprika file').toString('base64'), good.toString('base64')],
        filenames: ['broken.paprikarecipe', 'good.paprikarecipe'],
        dryRun: true,
      });

      expect(operation.response?.summary).toEqual({ total: 2, valid: 1, invalid: 1 });
      const broken = operation.response?.items?.find((i) => i.errors.length > 0);
      // The error names the file it came from — "1 of 2 failed" isn't actionable
      // otherwise.
      expect(broken?.errors[0]).toContain('broken.paprikarecipe');
    },
  );

  test('advertises every format for discovery', async () => {
    // Unauthenticated, like Playwright's `request` fixture.
    const res = await fetch(`${getAppUrl()}/api/custom-methods`);
    const { methods } = (await res.json()) as {
      methods: Array<{
        plural: string;
        verb: string;
        bulkImport?: {
          formats: Array<{ id: string; inputType: string; multiple: boolean }>;
        };
      }>;
    };

    const formats = methods.find((m) => m.plural === 'recipes' && m.verb === 'bulk-import')
      ?.bulkImport?.formats;
    // Order matters: the import page selects the first format by default.
    expect(formats?.map((f) => f.id)).toEqual(['url', 'text', 'paprika']);
    expect(formats?.find((f) => f.id === 'url')?.inputType).toBe('text');
    expect(formats?.find((f) => f.id === 'text')?.inputType).toBe('text');
    expect(formats?.find((f) => f.id === 'paprika')?.multiple).toBe(true);
  });
});

describe('Recipes bulk import — page', () => {
  let h: Harness;
  let adminToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: adminToken } = await h.loginAs(h.admin));
  });

  afterEach(async () => {
    await h.close();
  });

  test('imports pasted text through the standardized page', { timeout: BULK_IMPORT_TIMEOUT_MS }, async () => {
    const d = h.driver;
    // Import used to be a modal; it has its own route now, like every other app.
    await d.goto('/recipes');
    await d.getByTestId('import-recipe-button').click();
    await d.waitForURL(/\/recipes\/import$/);

    // URL is the first format, so it's the one selected by default. Pick the
    // text importer explicitly — both accept text input, so without this the
    // pasted recipe would be handed to the URL importer.
    await d.getByTestId('import-format-text').click();
    await d.getByTestId('import-text-input').fill(RECIPE_TEXT);
    await d.getByTestId('bulk-import-preview-button').click();

    // Assert against the preview row, not the page: the pasted text is still
    // sitting in the textarea, so a bare getByText matches even on no preview.
    await d
      .expect(
        d.getByTestId('recipe-import-preview-row').filter({ hasText: 'Bacon Wrapped Asparagus' }),
      )
      .toBeVisible();
    await d.getByTestId('import-button').click();
    await d.waitForURL(/\/recipes$/);

    const recipes = await listOrEmpty<RecipeRecord>(adminToken, 'recipes');
    expect(recipes.map((r) => r.title)).toEqual(['Bacon Wrapped Asparagus']);
  });

  test('offers a format picker and switches to the Paprika file input', async () => {
    const d = h.driver;
    await d.goto('/recipes/import');

    // The picker is built from the server's format list, not client code.
    await d.expect(d.getByTestId('import-format-text')).toBeVisible();
    await d.expect(d.getByTestId('import-text-input')).toBeVisible();

    await d.getByTestId('import-format-paprika').click();
    await d.expect(d.getByTestId('bulk-import-file-input')).toBeAttached();
    await d.expect(d.getByTestId('import-text-input')).toHaveCount(0);
  });
});
