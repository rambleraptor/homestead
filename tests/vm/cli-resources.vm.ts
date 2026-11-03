/**
 * `homestead resources` against a real server, on the VM tier.
 *
 * Runs the CLI's command function in-process — its `fetch` reaches the VM
 * server through the harness's fetch shim — so the whole path is real: the
 * OpenAPI load (aep-lib-ts), custom-method discovery, and calls through the
 * shared client (multipart uploads, awaited operations).
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { getAppUrl } from '../e2e/config/aepbase.setup';
import { listOrEmpty } from '../e2e/utils/aepbase-helpers';
import { resourcesCmd } from '../../packages/homestead-cli/src/resources';

const TIMEOUT_MS = 60_000;

const RECIPE_TEXT = [
  'Bacon Wrapped Asparagus',
  '',
  'Ingredients:',
  '1 pound asparagus, trimmed',
  '8 strips thick-cut bacon',
  '',
  'Directions:',
  'Bake until the bacon is crisp.',
].join('\n');

const GIFT_CARD_CSV = 'merchant,card_number,amount\nAmazon,1111,50\nTarget,2222,25\n';

interface Run {
  code: number;
  out: unknown;
  stderr: string;
}

describe('homestead resources — custom methods', () => {
  let h: Harness;
  let token: string;
  let dir: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.admin));
    dir = mkdtempSync(join(tmpdir(), 'hs-cli-vm-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await h.close();
  });

  /** Run the command, capturing what it prints. */
  async function run(...args: string[]): Promise<Run> {
    const logs: string[] = [];
    const errors: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const code = await resourcesCmd([...args, '--server-url', getAppUrl(), '--token', token]);
    vi.restoreAllMocks();
    const text = logs.join('\n');
    let out: unknown = text;
    try {
      out = text ? JSON.parse(text) : undefined;
    } catch {
      // help text, not JSON
    }
    return { code, out, stderr: errors.join('\n') };
  }

  test('previews, then imports exactly the previewed rows', { timeout: TIMEOUT_MS }, async () => {
    const preview = await run('recipe', 'bulk-import', '--format', 'text', '--text', RECIPE_TEXT, '--validate-only');
    expect(preview.code).toBe(0);
    const { preview_id, summary } = preview.out as { preview_id: string; summary: { valid: number } };
    expect(summary.valid).toBe(1);
    expect(preview.stderr).toContain(`--preview-id ${preview_id}`);
    expect(await listOrEmpty(token, 'recipes')).toHaveLength(0);

    const imported = await run('recipe', 'bulk-import', '--format', 'text', '--preview-id', preview_id);
    expect(imported.code).toBe(0);
    expect(imported.out).toMatchObject({ validate_only: false, created: 1 });
    const recipes = await listOrEmpty<{ title: string }>(token, 'recipes');
    expect(recipes.map((r) => r.title)).toEqual(['Bacon Wrapped Asparagus']);
  });

  test('uploads a file for a file format, in one step', { timeout: TIMEOUT_MS }, async () => {
    const csv = join(dir, 'cards.csv');
    writeFileSync(csv, GIFT_CARD_CSV);

    const result = await run('gift-card', 'bulk-import', '--format', 'csv', '--file', csv, '--select', '1');
    expect(result.code).toBe(0);
    expect(result.out).toMatchObject({ created: 1 });
    const cards = await listOrEmpty<{ merchant: string }>(token, 'gift-cards');
    expect(cards.map((c) => c.merchant)).toEqual(['Target']);
  });

  test('a refused preview id exits non-zero with the server message', { timeout: TIMEOUT_MS }, async () => {
    const result = await run('recipe', 'bulk-import', '--format', 'text', '--preview-id', 'nope');
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/expired or was already imported/);
  });

  test('help lists the import formats', { timeout: TIMEOUT_MS }, async () => {
    const result = await run('recipe');
    expect(result.code).toBe(0);
    expect(result.out).toContain('Import formats (bulk-import --format):');
    expect(result.out).toMatch(/paprika\s+files/);
  });
});
