/**
 * The handler imports a held preview instead of parsing again — what keeps a
 * model-backed parser from running twice and saving something other than what
 * the person reviewed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkImportDef, ParsedItem } from '../../../resources/bulk-import/types';

const parse = vi.fn();
const save = vi.fn();

const def: BulkImportDef = {
  formats: [
    {
      id: 'social',
      label: 'Social',
      inputType: 'text',
      load: async () => ({ default: { parse } }),
    },
    {
      id: 'text',
      label: 'Text',
      inputType: 'text',
      load: async () => ({ default: { parse } }),
    },
  ],
  save: async () => ({ save }),
};

vi.mock('../../../apps/registry', () => ({
  getResourceBulkImport: () => def,
  getAllResourceBulkImports: () => ({ recipes: def }),
  getAllResourceDefs: () => [],
}));
vi.mock('../../ai/config', () => ({ isAiConfigured: () => true }));

import bulkImport, { validate } from '../handler';
import { clearPreviews } from '../previews';

function ctx(body: unknown, userId = 'u1') {
  return {
    plural: 'recipes',
    verb: 'bulk-import',
    target: 'collection',
    auth: { token: 't', user: { id: userId, path: `users/${userId}`, email: 'a@b.c' } },
    request: new Request('http://x/recipes:bulk-import', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  } as never;
}

const item = (index: number, title: string): ParsedItem => ({
  index,
  data: { title },
  errors: [],
  warnings: [],
});

beforeEach(() => {
  clearPreviews();
  parse.mockReset();
  save.mockReset();
  save.mockImplementation(async ({ items }: { items: ParsedItem[] }) => ({
    created: items.length,
    failed: [],
  }));
});

async function preview(text = 'https://www.tiktok.com/@a/video/1') {
  const res = await bulkImport(ctx({ format: 'social', text, dryRun: true }));
  if (!res.dryRun) throw new Error('expected a preview');
  return res;
}

describe('importing a preview', () => {
  it('writes the previewed rows without parsing again', async () => {
    parse.mockResolvedValueOnce([item(0, 'Fried Rice'), item(1, 'Pancakes')]);
    const { previewId, items } = await preview();
    expect(items.map((i) => i.label ?? (i.data as { title: string }).title)).toEqual([
      'Fried Rice',
      'Pancakes',
    ]);

    // A second parse would read the input differently — it must not happen.
    parse.mockResolvedValue([item(0, 'Something else')]);
    const result = await bulkImport(ctx({ format: 'social', previewId, selectedIndices: [1] }));

    expect(parse).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ dryRun: false, created: 1 });
    expect(save.mock.calls[0][0].items.map((i: ParsedItem) => i.data)).toEqual([
      { title: 'Pancakes' },
    ]);
  });

  it('is single-use', async () => {
    parse.mockResolvedValueOnce([item(0, 'Fried Rice')]);
    const { previewId } = await preview();
    await bulkImport(ctx({ format: 'social', previewId }));

    const res = await validate(ctx({ format: 'social', previewId }));
    expect(res?.status).toBe(410);
    await expect(bulkImport(ctx({ format: 'social', previewId }))).rejects.toThrow(/preview/i);
  });

  it("can't be imported by someone else, or under another format", async () => {
    parse.mockResolvedValueOnce([item(0, 'Fried Rice')]);
    const { previewId } = await preview();

    expect((await validate(ctx({ format: 'social', previewId }, 'u2')))?.status).toBe(410);
    expect((await validate(ctx({ format: 'text', previewId })))?.status).toBe(410);
    // Still there for its owner.
    expect(await validate(ctx({ format: 'social', previewId }))).toBeUndefined();
  });

  it('needs no input alongside a preview id, and refuses one with dryRun', async () => {
    parse.mockResolvedValueOnce([item(0, 'Fried Rice')]);
    const { previewId } = await preview();
    expect(await validate(ctx({ format: 'social', previewId }))).toBeUndefined();
    expect(
      (await validate(ctx({ format: 'social', previewId, dryRun: true })))?.status,
    ).toBe(400);
    expect((await validate(ctx({ format: 'social', previewId: '' })))?.status).toBe(400);
  });

  it('still parses afresh when no preview is named', async () => {
    parse.mockResolvedValue([item(0, 'Fried Rice')]);
    const result = await bulkImport(ctx({ format: 'social', text: 'https://youtu.be/x' }));
    expect(parse).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ dryRun: false, created: 1 });
  });

  it('refuses a selected row the preview marked as errored', async () => {
    parse.mockResolvedValueOnce([{ ...item(0, 'Bad'), errors: ['no recipe'] }]);
    const { previewId } = await preview();
    await expect(
      bulkImport(ctx({ format: 'social', previewId, selectedIndices: [0] })),
    ).rejects.toThrow(/has errors/);
  });
});
