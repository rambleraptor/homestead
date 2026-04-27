/**
 * Coverage for the generic aepbase resource hooks.
 *
 * Each test renders the hook with a fresh QueryClient + mocked aepbase
 * (the global mock from `src/test/setup.ts`) and verifies the hook's
 * default behavior plus a representative customization point.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { aepbase } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import {
  useAepList,
  useAepGet,
  useAepCreate,
  useAepUpdate,
  useAepRemove,
} from '@/core/api/resourceHooks';

interface Thing {
  id: string;
  name: string;
  create_time?: string;
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAepList', () => {
  it('fetches via aepbase.list and uses the module list cache key', async () => {
    vi.mocked(aepbase.list).mockResolvedValueOnce([
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ]);

    const { client, Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAepList<Thing>('things', { moduleId: 'things' }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(aepbase.list).toHaveBeenCalledWith('things');
    expect(client.getQueryData(queryKeys.module('things').list())).toHaveLength(2);
  });

  it('applies the optional client-side sort', async () => {
    vi.mocked(aepbase.list).mockResolvedValueOnce([
      { id: '1', name: 'b' },
      { id: '2', name: 'a' },
    ]);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useAepList<Thing>('things', {
          moduleId: 'things',
          sort: (a, b) => a.name.localeCompare(b.name),
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((t) => t.name)).toEqual(['a', 'b']);
  });

  it('passes the parent path to aepbase.list when provided', async () => {
    vi.mocked(aepbase.list).mockResolvedValueOnce([]);

    const { Wrapper } = makeWrapper();
    renderHook(
      () =>
        useAepList<Thing>('transactions', {
          moduleId: 'gift-cards',
          parent: ['gift-cards', 'card-1'],
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() =>
      expect(aepbase.list).toHaveBeenCalledWith('transactions', {
        parent: ['gift-cards', 'card-1'],
      }),
    );
  });

  it('honors a custom queryFn (escape hatch for joins / N+1 fetches)', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useAepList<Thing>('things', {
          moduleId: 'things',
          queryFn: async () => [{ id: 'custom', name: 'derived' }],
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(aepbase.list).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([{ id: 'custom', name: 'derived' }]);
  });
});

describe('useAepGet', () => {
  it('fetches a single record and caches under the detail key', async () => {
    vi.mocked(aepbase.get).mockResolvedValueOnce({ id: '7', name: 'seven' });

    const { client, Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAepGet<Thing>('things', '7', { moduleId: 'things' }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(aepbase.get).toHaveBeenCalledWith('things', '7');
    expect(client.getQueryData(queryKeys.module('things').detail('7'))).toEqual({
      id: '7',
      name: 'seven',
    });
  });

  it('disables the query when id is null', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAepGet<Thing>('things', null, { moduleId: 'things' }),
      { wrapper: Wrapper },
    );

    expect(aepbase.get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAepCreate', () => {
  it('POSTs the variables as the body and invalidates the module', async () => {
    vi.mocked(aepbase.create).mockResolvedValueOnce({ id: 'new', name: 'fresh' });

    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    // Seed and re-spy on `useQueryClient` instance behavior is exercised
    // indirectly by checking the method on a spy wrapper. Instead we read
    // the mock invocation count directly after the mutation.
    const { result } = renderHook(
      () =>
        useAepCreate<Thing, { name: string }>('things', { moduleId: 'things' }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ name: 'fresh' });
    });

    expect(aepbase.create).toHaveBeenCalledWith('things', { name: 'fresh' });
    // Reset the spy so the assertion below isn't tainted by other invalidations.
    expect(
      invalidateSpy.mock.calls.some(
        (call) =>
          Array.isArray((call[0] as { queryKey?: unknown[] }).queryKey) &&
          ((call[0] as { queryKey: unknown[] }).queryKey[0] === 'module') &&
          ((call[0] as { queryKey: unknown[] }).queryKey[1] === 'things'),
      ),
    ).toBe(true);
  });

  it('uses the transform to map vars → body (e.g. FormData / created_by)', async () => {
    vi.mocked(aepbase.create).mockResolvedValueOnce({ id: 'x', name: 'y' });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useAepCreate<Thing, { title: string }>('things', {
          moduleId: 'things',
          transform: (vars) => ({ name: vars.title, created_by: 'users/u-1' }),
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ title: 'Hello' });
    });

    expect(aepbase.create).toHaveBeenCalledWith('things', {
      name: 'Hello',
      created_by: 'users/u-1',
    });
  });
});

describe('useAepUpdate', () => {
  it('PATCHes by id with vars.data as the body by default', async () => {
    vi.mocked(aepbase.update).mockResolvedValueOnce({ id: 'a', name: 'renamed' });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useAepUpdate<Thing, { id: string; data: Partial<Thing> }>('things', {
          moduleId: 'things',
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ id: 'a', data: { name: 'renamed' } });
    });

    expect(aepbase.update).toHaveBeenCalledWith('things', 'a', {
      name: 'renamed',
    });
  });
});

describe('useAepRemove', () => {
  it('removes by id when V is string', async () => {
    vi.mocked(aepbase.remove).mockResolvedValueOnce(undefined);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAepRemove('things', { moduleId: 'things' }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync('to-delete');
    });

    expect(aepbase.remove).toHaveBeenCalledWith('things', 'to-delete');
  });

  it('uses getId when the variables are richer (e.g. parent-aware delete)', async () => {
    vi.mocked(aepbase.remove).mockResolvedValueOnce(undefined);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useAepRemove<{ id: string; cardId: string }>('perks', {
          moduleId: 'credit-cards',
          getId: (vars) => vars.id,
          parent: () => ['credit-cards', 'placeholder'],
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ id: 'p-1', cardId: 'c-1' });
    });

    expect(aepbase.remove).toHaveBeenCalledWith('perks', 'p-1', {
      parent: ['credit-cards', 'placeholder'],
    });
  });
});
