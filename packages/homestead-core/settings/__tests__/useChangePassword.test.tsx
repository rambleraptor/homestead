/**
 * Tests for useChangePassword hook
 *
 * The hook re-authenticates via aepbase.login (verifying the old password),
 * then PATCHes /users/{id} with the new password. These tests mock both.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useChangePassword } from '../hooks/useChangePassword';
import type { ChangePasswordData } from '../hooks/useChangePassword';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useChangePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aepbase.login).mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com',
      username: 'test@example.com',
      name: 'Test User',
      verified: true,
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
    });
    vi.mocked(aepbase.update).mockResolvedValue({ id: 'test-user-id' });
  });

  it('re-authenticates and updates the password on success', async () => {
    const passwordData: ChangePasswordData = {
      oldPassword: 'oldpassword123',
      password: 'newpassword123',
      passwordConfirm: 'newpassword123',
    };

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(passwordData);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(aepbase.login).toHaveBeenCalledWith('test@example.com', 'oldpassword123');
    expect(aepbase.update).toHaveBeenCalledWith('users', 'test-user-id', {
      password: 'newpassword123',
    });
  });

  it('fails when new password and confirm do not match', async () => {
    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      oldPassword: 'x',
      password: 'a',
      passwordConfirm: 'b',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(aepbase.login).not.toHaveBeenCalled();
    expect(aepbase.update).not.toHaveBeenCalled();
  });

  it('propagates the aepbase error when the old password is wrong', async () => {
    const error = new Error('invalid email or password');
    vi.mocked(aepbase.login).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      oldPassword: 'wrong',
      password: 'new',
      passwordConfirm: 'new',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toEqual(error);
    expect(aepbase.update).not.toHaveBeenCalled();
  });

  it('throws when the user is not authenticated', async () => {
    vi.mocked(aepbase.getCurrentUser).mockReturnValueOnce(null);

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      oldPassword: 'old',
      password: 'new',
      passwordConfirm: 'new',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toEqual(new Error('User not authenticated'));
  });

  it('sets isPending during the mutation', async () => {
    let resolveLogin: (v: unknown) => void;
    const loginPromise = new Promise((r) => {
      resolveLogin = r;
    });
    vi.mocked(aepbase.login).mockReturnValueOnce(
      loginPromise as ReturnType<typeof aepbase.login>,
    );

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);
    result.current.mutate({
      oldPassword: 'old',
      password: 'new',
      passwordConfirm: 'new',
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    resolveLogin!({
      id: 'test-user-id',
      email: 'test@example.com',
      username: 'test@example.com',
      name: 'Test User',
      verified: true,
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});
