/**
 * Optimistic create, and writes made to an item before the server has it,
 * exercised against the generic factory (registered for the groceries app via
 * the same code the runtime uses). The aepbase client is the global mock from
 * `src/test/setup.ts`; writes reach it through the page's outbox.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import { outbox } from '@rambleraptor/homestead-core/api/outbox';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { newRecordId } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import type { GroceryItem } from '../../types';
import { groceryKeys, makeGroceriesClient, resetOutbox, runMutation } from './testUtils';

const ITEMS_KEY = queryKeys.app('groceries').resource('grocery').list();

function item(id: string, fields: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id,
    name: 'Milk',
    checked: false,
    created: '2026-04-27T00:00:00Z',
    updated: '2026-04-27T00:00:00Z',
    ...fields,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetOutbox();
});

afterEach(async () => {
  onlineManager.setOnline(true);
  await resetOutbox();
});

describe('create-grocery mutation', () => {
  it('inserts an optimistic record, under its final id, before the server responds', async () => {
    const client = makeGroceriesClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, []);
    const recordId = newRecordId();

    let respond!: () => void;
    vi.mocked(aepbase.create).mockImplementationOnce(
      () => new Promise((res) => (respond = () => res(item(recordId, { name: 'Milk' })))),
    );

    const creating = runMutation<GroceryItem>(client, groceryKeys.create, { name: 'Milk', recordId });

    await vi.waitFor(() => {
      const list = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(recordId);
      expect(list[0].name).toBe('Milk');
    });

    respond();
    await creating;
    const list = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(list.map((i) => i.id)).toEqual([recordId]);
  });

  it('rolls back the cache on server error', async () => {
    const client = makeGroceriesClient();
    const seed = [item('existing', { name: 'Bread' })];
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, seed);
    vi.mocked(aepbase.create).mockRejectedValueOnce(new AepbaseError(400, 'name is required', '/groceries'));

    await expect(
      runMutation(client, groceryKeys.create, { name: '', recordId: newRecordId() }),
    ).rejects.toThrow();

    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY)).toEqual(seed);
  });
});

describe('writes to an item the server has not seen yet', () => {
  it('sends a follow-up update to the same id', async () => {
    const client = makeGroceriesClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, []);
    const recordId = newRecordId();
    vi.mocked(aepbase.create).mockResolvedValueOnce(item(recordId, { name: 'Cheese' }));
    vi.mocked(aepbase.update).mockResolvedValueOnce(item(recordId, { name: 'Cheese', checked: true }));

    await runMutation(client, groceryKeys.create, { name: 'Cheese', recordId });
    await runMutation(client, groceryKeys.update, { id: recordId, data: { checked: true } });

    expect(aepbase.update).toHaveBeenCalledWith('groceries', recordId, { checked: true });
  });

  it('sends nothing for an item added and removed while offline', async () => {
    const client = makeGroceriesClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, []);
    const recordId = newRecordId();
    onlineManager.setOnline(false);

    await runMutation(client, groceryKeys.create, { name: 'Salt', recordId });
    await runMutation(client, groceryKeys.delete, recordId);
    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? []).toHaveLength(0);

    onlineManager.setOnline(true);
    await outbox.drain();
    expect(aepbase.create).not.toHaveBeenCalled();
    expect(aepbase.remove).not.toHaveBeenCalled();
  });
});
