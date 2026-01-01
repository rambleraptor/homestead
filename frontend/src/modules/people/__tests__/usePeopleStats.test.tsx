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

// Mock the usePeople hook
vi.mock('../hooks/usePeople', () => ({
  usePeople: vi.fn(),
}));

import { usePeople } from '../hooks/usePeople';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('usePeopleStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate stats for upcoming people correctly', async () => {
    const now = new Date('2024-06-15');
    vi.setSystemTime(now);

    const mockPeople: Person[] = [
      {
        id: '1',
        name: 'John',
        addresses: [],
        birthday: '1990-06-20', // Upcoming birthday
        notification_preferences: ['day_of', 'day_before'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'Jane & Bob',
        addresses: [],
        anniversary: '2010-07-01', // Upcoming anniversary
        notification_preferences: ['week_before'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
      {
        id: '3',
        name: 'Sarah',
        addresses: [],
        birthday: '1985-08-15', // Not upcoming in next 30 days
        notification_preferences: ['day_of'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
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

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const stats = result.current.data!;

    expect(stats.totalPeople).toBe(3);
    // John's Birthday (June 20) and Jane & Bob's Anniversary (July 1) should be upcoming
    expect(stats.upcomingBirthdays).toBe(1);
    expect(stats.upcomingAnniversaries).toBe(1);

    vi.useRealTimers();
  });

  it('should handle birthdays that passed this year but recur yearly', async () => {
    const now = new Date('2024-08-01');
    vi.setSystemTime(now);

    const mockPeople: Person[] = [
      {
        id: '1',
        name: 'John',
        addresses: [],
        birthday: '1990-01-15', // Original date in 2023
        notification_preferences: ['day_of'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'Sarah',
        addresses: [],
        birthday: '1985-08-15', // Still upcoming this year
        notification_preferences: ['day_of'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
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

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const stats = result.current.data!;

    expect(stats.totalPeople).toBe(2);
    // John's birthday already passed this year (Jan 15), won't occur until next year's 30-day window
    // Sarah's birthday is upcoming (Aug 15)
    expect(stats.upcomingBirthdays).toBe(1);
    expect(stats.upcomingAnniversaries).toBe(0);

    vi.useRealTimers();
  });

  it('should return zero stats when no people exist', async () => {
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

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const stats = result.current.data!;

    expect(stats.totalPeople).toBe(0);
    expect(stats.upcomingBirthdays).toBe(0);
    expect(stats.upcomingAnniversaries).toBe(0);
  });
});
