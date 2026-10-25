/**
 * Tests for the public `useAppFlag` hook.
 *
 * The hook composes the singleton fetcher + upsert mutation, so these
 * exercise the end-to-end read/write flow against a mocked aepbase.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import { syncAppFlagsSchema } from '@rambleraptor/homestead-core/app-flags/sync';
import { initializeAppRegistry } from '@rambleraptor/homestead-core/apps/registry';
import { groceriesApp } from '@rambleraptor/homestead-apps/groceries/app.config';
import { useAppFlag } from '../hooks/useAppFlag';
import { AuthContext } from '../../auth/context';

beforeAll(() => {
  // Register the groceries app so `getAllAppFlagDefs` returns the
  // declared `default_store` default this suite relies on.
  initializeAppRegistry([groceriesApp]);
});

vi.mock('@rambleraptor/homestead-core/app-flags/sync', () => ({
  APP_FLAGS: 'app-flags',
  syncAppFlagsSchema: vi.fn(async () => ({ action: 'created' as const })),
}));

const createWrapper = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

/** A wrapper whose signed-in user is in the groups `groupIds`. */
const inGroups = (groupIds: string[]) => {
  const Query = createWrapper();
  const value = {
    user: { id: 'u1', permissions: { enforced: true, groupIds, groupNames: [], grants: [] } },
  } as unknown as React.ContextType<typeof AuthContext>;
  return ({ children }: { children: React.ReactNode }) => (
    <AuthContext.Provider value={value}>
      <Query>{children}</Query>
    </AuthContext.Provider>
  );
};

describe('useAppFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies a stored value only within its audience', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([
      { id: 'rec-1', groceries__default_store: 'store-1', groceries__default_store__audience: '["beta"]' },
    ]);

    const beta = renderHook(() => useAppFlag<string>('groceries', 'default_store'), {
      wrapper: inGroups(['beta']),
    });
    await waitFor(() => expect(beta.result.current.isLoading).toBe(false));
    expect(beta.result.current.value).toBe('store-1');
    expect(beta.result.current.inAudience).toBe(true);

    const other = renderHook(() => useAppFlag<string>('groceries', 'default_store'), {
      wrapper: inGroups(['members']),
    });
    await waitFor(() => expect(other.result.current.isLoading).toBe(false));
    // Outside the audience the flag reads as its declared default…
    expect(other.result.current.value).toBe('');
    expect(other.result.current.inAudience).toBe(false);
    // …while the stored value is still there for Flag Management to show.
    expect(other.result.current.storedValue).toBe('store-1');
    expect(other.result.current.audience).toEqual(['beta']);
  });

  it('writes an audience to the sibling field', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([{ id: 'rec-1' }]);
    vi.mocked(aepbase.update).mockResolvedValue({ id: 'rec-1' });

    const { result } = renderHook(() => useAppFlag<string>('groceries', 'default_store'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.setAudience(['beta']));

    expect(aepbase.update).toHaveBeenCalledWith('app-flags', 'rec-1', {
      groceries__default_store__audience: '["beta"]',
    });
  });

  it('returns the declared default when no record exists', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([]);

    const { result } = renderHook(
      () => useAppFlag<string>('groceries', 'default_store'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.value).toBe('');
  });

  it('reflects the value stored on the singleton record', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([
      { id: 'rec-1', groceries__default_store: 'store-1' },
    ]);

    const { result } = renderHook(
      () => useAppFlag<string>('groceries', 'default_store'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.value).toBe('store-1'));
  });

  it('PATCHes the existing record via setValue', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([
      { id: 'rec-1', groceries__default_store: 'store-1' },
    ]);
    vi.mocked(aepbase.update).mockResolvedValue({
      id: 'rec-1',
      groceries__default_store: 'store-2',
    });

    const { result } = renderHook(
      () => useAppFlag<string>('groceries', 'default_store'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.value).toBe('store-1'));
    await act(async () => {
      await result.current.setValue('store-2');
    });

    expect(aepbase.update).toHaveBeenCalledWith('app-flags', 'rec-1', {
      groceries__default_store: 'store-2',
    });
    expect(aepbase.create).not.toHaveBeenCalled();
  });

  it('creates a new record when none exists yet', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([]);
    vi.mocked(aepbase.create).mockResolvedValue({
      id: 'new-rec',
      groceries__default_store: 'store-1',
    });

    const { result } = renderHook(
      () => useAppFlag<string>('groceries', 'default_store'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.setValue('store-1');
    });

    expect(aepbase.create).toHaveBeenCalledWith('app-flags', {
      groceries__default_store: 'store-1',
    });
  });

  it('registers the schema and retries if the first upsert 404s', async () => {
    // Simulate app-flags not yet registered on aepbase: list 404s on the
    // initial read AND on the retry inside the mutation, then succeeds on
    // the post-sync retry.
    vi.mocked(aepbase.list)
      .mockRejectedValueOnce(new AepbaseError(404, 'not found', '/app-flags'))
      .mockRejectedValueOnce(new AepbaseError(404, 'not found', '/app-flags'))
      .mockResolvedValueOnce([]);
    vi.mocked(aepbase.create).mockResolvedValue({
      id: 'new-rec',
      groceries__default_store: 'store-1',
    });

    const { result } = renderHook(
      () => useAppFlag<string>('groceries', 'default_store'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.setValue('store-1');
    });

    expect(syncAppFlagsSchema).toHaveBeenCalledTimes(1);
    expect(aepbase.create).toHaveBeenCalledWith('app-flags', {
      groceries__default_store: 'store-1',
    });
  });
});
