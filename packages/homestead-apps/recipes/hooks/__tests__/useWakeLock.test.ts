import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWakeLock } from '../useWakeLock';

interface FakeSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
}

function installWakeLock(request: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  });
}

function fakeSentinel(): FakeSentinel {
  const sentinel: FakeSentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
    }),
  };
  return sentinel;
}

describe('useWakeLock', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  it('holds a screen lock while enabled and releases it when disabled', async () => {
    const sentinel = fakeSentinel();
    const request = vi.fn(async () => sentinel);
    installWakeLock(request);

    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current).toBe('held'));
    expect(request).toHaveBeenCalledWith('screen');

    rerender({ on: false });
    await waitFor(() => expect(sentinel.release).toHaveBeenCalled());
    expect(result.current).toBe('idle');
  });

  it('re-acquires the lock when the page becomes visible again', async () => {
    const first = fakeSentinel();
    const second = fakeSentinel();
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    installWakeLock(request);

    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    // The browser drops the lock when the page is hidden.
    first.released = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('reports a refused request to onError', async () => {
    const refusal = new Error('battery saver');
    installWakeLock(vi.fn(async () => Promise.reject(refusal)));
    const onError = vi.fn();

    const { result } = renderHook(() => useWakeLock(true, onError));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(refusal));
    expect(result.current).toBe('failed');
  });

  it('does nothing when the API is unsupported', () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe('idle');
  });
});
