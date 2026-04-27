/**
 * Coverage for `createOfflineResource` in isolation.
 *
 * The existing groceries tests (modules/groceries/hooks/__tests__) cover the
 * full end-to-end behavior on top of this factory; these tests verify the
 * factory's own contract — defaults, cascade hook, custom mutation keys.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { aepbase } from '@/core/api/aepbase';
import {
  createOfflineResource,
  newTempId,
  isTempId,
  type CascadeSnapshot,
} from '@/core/api/offlineResource';

interface Item {
  id: string;
  name: string;
  checked: boolean;
}

const LIST_KEY = ['module', 'demo', 'list'] as const;

interface CreateVars extends Record<string, unknown> {
  name: string;
  tempId: string;
}
interface UpdateVars {
  id: string;
  data: { name?: string; checked?: boolean };
}

function buildResource() {
  return createOfflineResource<Item, CreateVars, UpdateVars, string>({
    collection: 'items',
    moduleId: 'demo',
    listKey: LIST_KEY,
    buildCreateBody: (vars) => ({ name: vars.name, checked: false }),
    buildOptimistic: (vars, tempId) => ({ id: tempId, name: vars.name, checked: false }),
    applyOptimisticUpdate: (current, vars) =>
      current.map((it) => (it.id === vars.id ? { ...it, ...vars.data } : it)),
    applyOptimisticRemove: (current, id) => current.filter((it) => it.id !== id),
  });
}

async function runMutation<TData = unknown, TVars = unknown>(
  client: QueryClient,
  mutationKey: readonly unknown[],
  variables: TVars,
): Promise<TData> {
  const observer = new MutationObserver<TData, Error, TVars>(client, {
    mutationKey: mutationKey as unknown[],
  });
  try {
    return await observer.mutate(variables);
  } finally {
    observer.reset();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('newTempId / isTempId', () => {
  it('produces ids identifiable by isTempId', () => {
    const id = newTempId();
    expect(isTempId(id)).toBe(true);
    expect(isTempId('srv-1')).toBe(false);
  });
});

describe('default mutation keys', () => {
  it('namespaces under module/<moduleId>/<op>-<collection> so the persister filter matches', () => {
    const r = buildResource();
    expect(r.mutationKeys.create).toEqual(['module', 'demo', 'create-items']);
    expect(r.mutationKeys.update).toEqual(['module', 'demo', 'update-items']);
    expect(r.mutationKeys.remove).toEqual(['module', 'demo', 'remove-items']);
  });

  it('honors a mutationKeys override (used for backwards compat)', () => {
    const r = createOfflineResource<Item, CreateVars, UpdateVars, string>({
      collection: 'items',
      moduleId: 'demo',
      listKey: LIST_KEY,
      mutationKeys: {
        create: ['module', 'demo', 'create-item'] as const,
        update: ['module', 'demo', 'update-item'] as const,
        remove: ['module', 'demo', 'delete-item'] as const,
      },
      buildCreateBody: () => ({}),
      buildOptimistic: (_vars, tempId) => ({ id: tempId, name: '', checked: false }),
      applyOptimisticUpdate: (cur) => cur,
      applyOptimisticRemove: (cur) => cur,
    });
    expect(r.mutationKeys.create).toEqual(['module', 'demo', 'create-item']);
  });
});

describe('cascade on delete', () => {
  it('runs the cascade snapshot on mutate and rolls it back on error', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    client.setQueryData<Item[]>(LIST_KEY, [
      { id: 'a', name: 'A', checked: false },
    ]);
    const sideEffectKey = ['module', 'demo', 'side-effect'] as const;
    client.setQueryData<{ touched: boolean }>(sideEffectKey, { touched: false });

    const cascade = vi.fn(
      (qc: QueryClient): CascadeSnapshot => {
        const previous = qc.getQueryData(sideEffectKey);
        qc.setQueryData(sideEffectKey, { touched: true });
        return { rollback: (q) => q.setQueryData(sideEffectKey, previous) };
      },
    );

    const resource = createOfflineResource<Item, CreateVars, UpdateVars, string>({
      collection: 'items',
      moduleId: 'demo',
      listKey: LIST_KEY,
      buildCreateBody: () => ({}),
      buildOptimistic: (_v, tempId) => ({ id: tempId, name: '', checked: false }),
      applyOptimisticUpdate: (cur) => cur,
      applyOptimisticRemove: (cur, id) => cur.filter((it) => it.id !== id),
      onDeleteCascade: cascade,
    });
    resource.registerDefaults(client);

    vi.mocked(aepbase.remove).mockRejectedValueOnce(new Error('boom'));

    await expect(
      runMutation(client, resource.mutationKeys.remove, 'a'),
    ).rejects.toThrow();

    expect(cascade).toHaveBeenCalled();
    // Cascade rollback restored the side-effect cache.
    expect(client.getQueryData(sideEffectKey)).toEqual({ touched: false });
    // List was rolled back too.
    expect(client.getQueryData<Item[]>(LIST_KEY)).toEqual([
      { id: 'a', name: 'A', checked: false },
    ]);
  });
});

describe('temp-id resolution', () => {
  it('tracks tempId → real-id mapping through resolveId', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    client.setQueryData<Item[]>(LIST_KEY, []);
    const r = buildResource();
    r.registerDefaults(client);

    vi.mocked(aepbase.create).mockResolvedValueOnce({
      id: 'srv-1',
      name: 'A',
      checked: false,
    });

    const tempId = r.newTempId();
    await runMutation(client, r.mutationKeys.create, { name: 'A', tempId });

    expect(r.resolveId(tempId)).toBe('srv-1');
    expect(r.resolveId('not-a-temp')).toBe('not-a-temp');

    r.clearTempIdMap();
    expect(r.resolveId(tempId)).toBe(tempId);
  });
});
