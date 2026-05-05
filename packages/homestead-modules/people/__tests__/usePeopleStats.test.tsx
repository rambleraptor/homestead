/**
 * Tests for usePeopleStats hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePeopleStats } from '../hooks/usePeopleStats';
import type { Person } from '../types';
import type { UseQueryResult } from '@tanstack/react-query';

vi.mock('../hooks/usePeople', () => ({
  usePeople: vi.fn(),
}));

import { usePeople } from '../hooks/usePeople';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('usePeopleStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the total people count', async () => {
    const mockPeople: Person[] = [
      {
        id: '1',
        name: 'John',
        addresses: [],
        created_by: 'user-1',
        created: '',
        updated: '',
      },
      {
        id: '2',
        name: 'Jane',
        addresses: [],
        created_by: 'user-1',
        created: '',
        updated: '',
      },
    ];

    vi.mocked(usePeople).mockReturnValue({
      data: mockPeople,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<Person[]>);

    const { result } = renderHook(() => usePeopleStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.totalPeople).toBe(2);
  });

  it('returns zero total when no people exist', async () => {
    vi.mocked(usePeople).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<Person[]>);

    const { result } = renderHook(() => usePeopleStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.totalPeople).toBe(0);
  });
});
