import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { useOnlineStatus } from '../useOnlineStatus';

afterEach(() => {
  // Restore default — onlineManager re-reads navigator.onLine when freed.
  onlineManager.setOnline(true);
});

describe('useOnlineStatus', () => {
  it('reports online by default', () => {
    onlineManager.setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it('flips when onlineManager toggles', () => {
    onlineManager.setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      onlineManager.setOnline(false);
    });
    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);

    act(() => {
      onlineManager.setOnline(true);
    });
    expect(result.current.isOnline).toBe(true);
  });
});
