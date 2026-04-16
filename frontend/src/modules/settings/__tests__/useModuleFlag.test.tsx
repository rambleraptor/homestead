/**
 * Tests for the public `useModuleFlag` hook.
 *
 * The hook composes the singleton fetcher + upsert mutation, so these
 * exercise the end-to-end read/write flow against a mocked aepbase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@/core/api/aepbase';
import { syncModuleFlagsSchema } from '@/core/module-flags/sync';
import { useModuleFlag } from '../hooks/useModuleFlag';

vi.mock('@/core/module-flags/sync', () => ({
  syncModuleFlagsSchema: vi.fn(async () => ({ action: 'created' as const })),
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

describe('useModuleFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the declared default when no record exists', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([]);

    const { result } = renderHook(
      () => useModuleFlag<string>('settings', 'omnibox_access'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.value).toBe('superuser');
  });

  it('reflects the value stored on the singleton record', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([
      { id: 'rec-1', settings__omnibox_access: 'all' },
    ]);

    const { result } = renderHook(
      () => useModuleFlag<string>('settings', 'omnibox_access'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.value).toBe('all'));
  });

  it('PATCHes the existing record via setValue', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([
      { id: 'rec-1', settings__omnibox_access: 'superuser' },
    ]);
    vi.mocked(aepbase.update).mockResolvedValue({
      id: 'rec-1',
      settings__omnibox_access: 'all',
    });

    const { result } = renderHook(
      () => useModuleFlag<string>('settings', 'omnibox_access'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.value).toBe('superuser'));
    await act(async () => {
      await result.current.setValue('all');
    });

    expect(aepbase.update).toHaveBeenCalledWith('module-flags', 'rec-1', {
      settings__omnibox_access: 'all',
    });
    expect(aepbase.create).not.toHaveBeenCalled();
  });

  it('creates a new record when none exists yet', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([]);
    vi.mocked(aepbase.create).mockResolvedValue({
      id: 'new-rec',
      settings__omnibox_access: 'all',
    });

    const { result } = renderHook(
      () => useModuleFlag<string>('settings', 'omnibox_access'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.setValue('all');
    });

    expect(aepbase.create).toHaveBeenCalledWith('module-flags', {
      settings__omnibox_access: 'all',
    });
  });

  it('registers the schema and retries if the first upsert 404s', async () => {
    // Simulate module-flags not yet registered on aepbase: list 404s on the
    // initial read AND on the retry inside the mutation, then succeeds on
    // the post-sync retry.
    vi.mocked(aepbase.list)
      .mockRejectedValueOnce(new AepbaseError(404, 'not found', '/module-flags'))
      .mockRejectedValueOnce(new AepbaseError(404, 'not found', '/module-flags'))
      .mockResolvedValueOnce([]);
    vi.mocked(aepbase.create).mockResolvedValue({
      id: 'new-rec',
      settings__omnibox_access: 'all',
    });

    const { result } = renderHook(
      () => useModuleFlag<string>('settings', 'omnibox_access'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.setValue('all');
    });

    expect(syncModuleFlagsSchema).toHaveBeenCalledTimes(1);
    expect(aepbase.create).toHaveBeenCalledWith('module-flags', {
      settings__omnibox_access: 'all',
    });
  });
});
