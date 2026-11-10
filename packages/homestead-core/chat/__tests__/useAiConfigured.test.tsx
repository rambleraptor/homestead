/**
 * Whether the assistant is set up is the server's answer — and a request that
 * never reached the server is not one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { resetConnectivityProbe } from '@rambleraptor/homestead-core/api/connectivity';
import { queryClient as appClient } from '@rambleraptor/homestead-core/api/queryClient';
import { AI_CONFIGURED_STORAGE_KEY, useAiConfigured } from '../hooks/useAiConfigured';

const fetchMock = vi.fn();

function renderConfigured() {
  // The app's own defaults: a network failure waits for the connection.
  const client = new QueryClient({ defaultOptions: appClient.getDefaultOptions() });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAiConfigured(), { wrapper });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  localStorage.clear();
  onlineManager.setOnline(true);
});

afterEach(() => {
  resetConnectivityProbe();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe('useAiConfigured', () => {
  it("gives the server's answer and remembers it on the device", async () => {
    fetchMock.mockResolvedValue(Response.json({ configured: true }));
    const { result } = renderConfigured();
    await waitFor(() => expect(result.current).toBe(true));
    expect(localStorage.getItem(AI_CONFIGURED_STORAGE_KEY)).toBe('true');
  });

  it('reads an error answer as not configured', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const { result } = renderConfigured();
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('keeps the remembered answer when the server cannot be reached', async () => {
    localStorage.setItem(AI_CONFIGURED_STORAGE_KEY, 'true');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderConfigured();
    await waitFor(() => expect(onlineManager.isOnline()).toBe(false));
    expect(result.current).toBe(true);
  });

  it('does not know, rather than say "not set up", offline with nothing remembered', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderConfigured();
    await waitFor(() => expect(onlineManager.isOnline()).toBe(false));
    expect(result.current).toBeUndefined();
  });
});
