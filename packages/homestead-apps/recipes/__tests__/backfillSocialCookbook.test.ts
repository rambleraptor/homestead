/**
 * The one-shot backfill: recipes whose source is a social post are filed into
 * the "From social" cookbook, oldest first; anything else is left alone.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MigrationContext } from '@rambleraptor/homestead-core/apps/migrations';

const h = vi.hoisted(() => ({
  recipes: [] as Array<{ id: string; source_pointer?: string; create_time?: string }>,
  filed: [] as string[][],
}));

vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => ({
    collection: (name: string) => {
      if (name !== 'recipes') throw new Error(`unexpected collection ${name}`);
      return { listAll: async () => h.recipes };
    },
  }),
}));
vi.mock('../methods/social-cookbook', () => ({
  fileInSocialCookbook: vi.fn(async (_client: unknown, ids: string[]) => {
    h.filed.push(ids);
    return ids.length;
  }),
}));

import migrate from '../migrations/backfill-social-cookbook';

const ctx = { id: 'x', appId: 'recipes', token: 't', log: vi.fn() } as unknown as MigrationContext;

beforeEach(() => {
  h.recipes = [];
  h.filed = [];
  vi.mocked(ctx.log).mockClear();
});

describe('recipes-backfill-social-cookbook', () => {
  it('files social-sourced recipes oldest first and skips the rest', async () => {
    h.recipes = [
      { id: 'blog', source_pointer: 'https://example.com/pasta', create_time: '2026-01-01T00:00:00Z' },
      { id: 'tt2', source_pointer: 'https://www.tiktok.com/@a/video/2', create_time: '2026-03-01T00:00:00Z' },
      { id: 'book', source_pointer: 'Book: Food Lab pg 124' },
      { id: 'ig1', source_pointer: 'https://www.instagram.com/p/abc/', create_time: '2026-02-01T00:00:00Z' },
      { id: 'yt3', source_pointer: 'https://youtu.be/xyz', create_time: '2026-04-01T00:00:00Z' },
      { id: 'none' },
    ];
    const result = await migrate(ctx);
    expect(h.filed).toEqual([['ig1', 'tt2', 'yt3']]);
    expect(result).toEqual({ scanned: 6, social: 3, filed: 3 });
    expect(ctx.log).toHaveBeenCalledWith('filed 3 social recipes');
  });

  it('calls the filer with nothing when no recipe is social, so no cookbook is made', async () => {
    h.recipes = [{ id: 'blog', source_pointer: 'https://example.com/pasta' }];
    const result = await migrate(ctx);
    expect(h.filed).toEqual([[]]);
    expect(result).toEqual({ scanned: 1, social: 0, filed: 0 });
    expect(ctx.log).not.toHaveBeenCalled();
  });
});
