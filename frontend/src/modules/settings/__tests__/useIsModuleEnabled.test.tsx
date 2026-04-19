/**
 * Tests for the shared `useIsModuleEnabled` gate that reads the built-in
 * `enabled` flag for a given module and combines it with the current
 * user's role.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsModuleEnabled } from '../hooks/useIsModuleEnabled';
import { useModuleFlag } from '../hooks/useModuleFlag';
import { useAuth } from '@/core/auth/useAuth';
import type { User } from '@/core/auth/types';

vi.mock('@/core/auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useModuleFlag', () => ({
  useModuleFlag: vi.fn(),
}));

const mockUser = (type: 'superuser' | 'regular'): User => ({
  id: 'u1',
  email: 'u1@example.com',
  username: 'u1@example.com',
  name: 'U1',
  verified: true,
  created: '2024-01-01',
  updated: '2024-01-01',
  type,
});

const mockFlag = (value: string | undefined) => {
  vi.mocked(useModuleFlag).mockReturnValue({
    value,
    setValue: vi.fn(),
    isLoading: false,
    isSaving: false,
    error: null,
  });
};

const mockAuth = (user: User | null) => {
  vi.mocked(useAuth).mockReturnValue({
    user,
    token: user ? 't' : null,
    isAuthenticated: user !== null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
};

describe('useIsModuleEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for 'none' even for superusers", () => {
    mockAuth(mockUser('superuser'));
    mockFlag('none');
    const { result } = renderHook(() => useIsModuleEnabled('recipes'));
    expect(result.current).toBe(false);
  });

  it("returns true for 'all' for any signed-in user", () => {
    mockAuth(mockUser('regular'));
    mockFlag('all');
    const { result } = renderHook(() => useIsModuleEnabled('recipes'));
    expect(result.current).toBe(true);
  });

  it("returns false for 'all' when signed out", () => {
    mockAuth(null);
    mockFlag('all');
    const { result } = renderHook(() => useIsModuleEnabled('recipes'));
    expect(result.current).toBe(false);
  });

  it("returns true for 'superusers' only for superusers", () => {
    mockAuth(mockUser('superuser'));
    mockFlag('superusers');
    const { result: superuser } = renderHook(() =>
      useIsModuleEnabled('recipes'),
    );
    expect(superuser.current).toBe(true);

    mockAuth(mockUser('regular'));
    const { result: regular } = renderHook(() =>
      useIsModuleEnabled('recipes'),
    );
    expect(regular.current).toBe(false);
  });

  it("falls back to the default 'all' when the flag is undefined", () => {
    mockAuth(mockUser('regular'));
    mockFlag(undefined);
    const { result } = renderHook(() => useIsModuleEnabled('recipes'));
    expect(result.current).toBe(true);
  });
});
