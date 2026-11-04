/**
 * The recipes saver: every format creates one recipe per item; only the
 * social format then files the new recipes into the "From social" cookbook,
 * and a failure there never fails the import.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@rambleraptor/homestead-core/server/bulk-import/handler', () => ({
  createOnePerItem: vi.fn(),
}));
vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: vi.fn(() => ({ fake: true })),
}));
vi.mock('@rambleraptor/homestead-core/utils/logger', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('../methods/social-cookbook', () => ({ fileInSocialCookbook: vi.fn() }));

import { createOnePerItem } from '@rambleraptor/homestead-core/server/bulk-import/handler';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { fileInSocialCookbook } from '../methods/social-cookbook';
import { save } from '../methods/bulk-import-save';

const createAll = vi.mocked(createOnePerItem);
const file = vi.mocked(fileInSocialCookbook);

const ctxFor = (format: string) =>
  ({ auth: { token: 't', user: { path: 'users/1' } }, plural: 'recipes', format }) as never;

const items = [
  { index: 0, data: { title: 'A' }, errors: [], warnings: [] },
  { index: 1, data: { title: 'B' }, errors: [], warnings: [] },
];

beforeEach(() => {
  createAll.mockReset();
  file.mockReset();
  createAll.mockResolvedValue({ created: 2, failed: [], createdIds: ['r1', 'r2'] });
});

describe('recipes bulk-import saver', () => {
  it('creates the recipes and files them for the social format', async () => {
    file.mockResolvedValue(2);
    const result = await save({ items, ctx: ctxFor('social') });
    expect(createAll).toHaveBeenCalledWith({ items, ctx: ctxFor('social') });
    expect(file).toHaveBeenCalledWith({ fake: true }, ['r1', 'r2'], 'users/1');
    expect(result).toMatchObject({ created: 2, failed: [] });
  });

  it('only creates for every other format', async () => {
    for (const format of ['url', 'text', 'screenshots', 'paprika']) {
      await save({ items, ctx: ctxFor(format) });
    }
    expect(createAll).toHaveBeenCalledTimes(4);
    expect(file).not.toHaveBeenCalled();
  });

  it("keeps the import's result when filing fails, and logs it", async () => {
    file.mockRejectedValue(new Error('cookbook write refused'));
    const result = await save({ items, ctx: ctxFor('social') });
    expect(result).toMatchObject({ created: 2, failed: [] });
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});
