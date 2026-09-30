/**
 * Connectivity: a failed fetch flips the app offline, and the probe flips it
 * back once the server answers.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import {
  NetworkError,
  PROBE_URL,
  fetchOrNetworkError,
  isNetworkError,
  reportNetworkFailure,
  resetConnectivityProbe,
} from '../connectivity';

afterEach(() => {
  resetConnectivityProbe();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchOrNetworkError', () => {
  it('rewraps a fetch rejection as a NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await fetchOrNetworkError('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(isNetworkError(err)).toBe(true);
  });

  it('passes an HTTP error response through untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const res = await fetchOrNetworkError('/x');
    expect(res.status).toBe(500);
  });

  it('leaves aborts alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')));
    const err = await fetchOrNetworkError('/x').catch((e: unknown) => e);
    expect(isNetworkError(err)).toBe(false);
  });

  it('does not treat a bare TypeError as a network failure', () => {
    expect(isNetworkError(new TypeError('x is undefined'))).toBe(false);
  });
});

describe('reportNetworkFailure', () => {
  it('goes offline, then back online once the probe reaches the server', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    reportNetworkFailure();
    expect(onlineManager.isOnline()).toBe(false);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onlineManager.isOnline()).toBe(false);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(onlineManager.isOnline()).toBe(true);
    expect(fetch).toHaveBeenCalledWith(PROBE_URL, { cache: 'no-store' });
  });
});
