/**
 * Tests for useChangePassword hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useChangePassword } from '../hooks/useChangePassword';
import type { ChangePasswordData } from '../hooks/useChangePassword';

// Mock the PocketBase client
vi.mock('@/core/api/pocketbase', () => ({
  pb: {
    authStore: {
      record: {
        id: 'test-user-id',
        collectionId: 'users',
        collectionName: 'users',
      },
    },
    collection: vi.fn(),
  },
  Collections: {
    USERS: 'users',
  },
}));

import { pb } from '@/core/api/pocketbase';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useChangePassword', () => {
  const mockUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(pb.collection).mockReturnValue({
      update: mockUpdate,
    } as unknown as ReturnType<typeof pb.collection>);
  });

  it('should successfully change password', async () => {
    const passwordData: ChangePasswordData = {
      oldPassword: 'oldpassword123',
      password: 'newpassword123',
      passwordConfirm: 'newpassword123',
    };

    mockUpdate.mockResolvedValue({ id: 'test-user-id' });

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(passwordData);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockUpdate).toHaveBeenCalledWith('test-user-id', {
      oldPassword: 'oldpassword123',
      password: 'newpassword123',
      passwordConfirm: 'newpassword123',
    });
  });

  it('should handle errors when password change fails', async () => {
    const passwordData: ChangePasswordData = {
      oldPassword: 'wrongpassword',
      password: 'newpassword123',
      passwordConfirm: 'newpassword123',
    };

    const error = new Error('Incorrect current password');
    mockUpdate.mockRejectedValue(error);

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(passwordData);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('should throw error when user is not authenticated', async () => {
    // Mock unauthenticated state
    vi.mocked(pb.authStore).record = null;

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
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('User not authenticated'));

    // Reset for other tests
    vi.mocked(pb.authStore).record = {
      id: 'test-user-id',
      collectionId: 'users',
      collectionName: 'users',
    };
  });

  it('should set isPending state during mutation', async () => {
    const passwordData: ChangePasswordData = {
      oldPassword: 'oldpassword123',
      password: 'newpassword123',
      passwordConfirm: 'newpassword123',
    };

    let resolveMutation: (value: unknown) => void;
    const mutationPromise = new Promise((resolve) => {
      resolveMutation = resolve;
    });

    mockUpdate.mockReturnValue(mutationPromise);

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);

    result.current.mutate(passwordData);

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    resolveMutation!({ id: 'test-user-id' });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('should call collection with correct collection name', async () => {
    const passwordData: ChangePasswordData = {
      oldPassword: 'oldpassword123',
      password: 'newpassword123',
      passwordConfirm: 'newpassword123',
    };

    mockUpdate.mockResolvedValue({ id: 'test-user-id' });

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(passwordData);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(pb.collection).toHaveBeenCalledWith('users');
  });
});
