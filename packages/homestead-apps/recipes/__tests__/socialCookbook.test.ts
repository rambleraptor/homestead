/**
 * The automatic "From social" cookbook: created on first use, appended to in
 * order without duplicates, and never created for nothing.
 */

import { describe, expect, it } from 'vitest';
import type { HomesteadClient } from '@rambleraptor/homestead-client';
import {
  SOCIAL_COOKBOOK_NAME,
  appendRecipeIds,
  ensureSocialCookbook,
  fileInSocialCookbook,
} from '../methods/social-cookbook';

interface Row {
  id: string;
  [k: string]: unknown;
}

/** A client with one in-memory `cookbooks` collection and a write log. */
function fakeClient(rows: Row[] = []) {
  const creates: Row[] = [];
  const updates: Array<{ id: string; patch: Row }> = [];
  const client = {
    collection: (name: string) => {
      if (name !== 'cookbooks') throw new Error(`unexpected collection ${name}`);
      return {
        listAll: async (opts?: { filter?: string }) => {
          expect(opts?.filter).toBe('auto == "social"');
          return rows.filter((r) => r.auto === 'social');
        },
        create: async (body: Row) => {
          const created = { id: `cb${rows.length + 1}`, ...body };
          rows.push(created);
          creates.push(created);
          return created;
        },
        record: (id: string) => ({
          update: async (patch: Row) => {
            updates.push({ id, patch });
            const row = rows.find((r) => r.id === id)!;
            Object.assign(row, patch);
            return row;
          },
        }),
      };
    },
  } as unknown as HomesteadClient;
  return { client, rows, creates, updates };
}

describe('appendRecipeIds', () => {
  it('appends in order and skips ids already present', () => {
    expect(appendRecipeIds(['a'], ['b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    expect(appendRecipeIds(undefined, ['x'])).toEqual(['x']);
  });
});

describe('ensureSocialCookbook', () => {
  it('creates the cookbook once, marked auto and credited to the importer', async () => {
    const { client, creates } = fakeClient();
    const first = await ensureSocialCookbook(client, 'users/u1');
    const second = await ensureSocialCookbook(client, 'users/u2');
    expect(creates).toHaveLength(1);
    expect(first.id).toBe(second.id);
    expect(creates[0]).toMatchObject({
      name: SOCIAL_COOKBOOK_NAME,
      auto: 'social',
      recipes: [],
      created_by: 'users/u1',
    });
  });

  it('leaves created_by unset for the boot-time backfill', async () => {
    const { client, creates } = fakeClient();
    await ensureSocialCookbook(client);
    expect(creates[0]).not.toHaveProperty('created_by');
  });
});

describe('fileInSocialCookbook', () => {
  it('does nothing — not even create the cookbook — with no recipes', async () => {
    const { client, creates, updates } = fakeClient();
    expect(await fileInSocialCookbook(client, [])).toBe(0);
    expect(creates).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('appends new recipes after the existing ones and reports how many were new', async () => {
    const { client, updates } = fakeClient([
      { id: 'cb1', name: SOCIAL_COOKBOOK_NAME, auto: 'social', recipes: ['r1'] },
    ]);
    expect(await fileInSocialCookbook(client, ['r2', 'r1', 'r3'])).toBe(2);
    expect(updates).toEqual([{ id: 'cb1', patch: { recipes: ['r1', 'r2', 'r3'] } }]);
  });

  it('skips the write when every recipe is already filed', async () => {
    const { client, updates } = fakeClient([
      { id: 'cb1', name: SOCIAL_COOKBOOK_NAME, auto: 'social', recipes: ['r1', 'r2'] },
    ]);
    expect(await fileInSocialCookbook(client, ['r2'])).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
