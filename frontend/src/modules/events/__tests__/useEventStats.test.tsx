/**
 * Tests for useEventStats hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useEventStats } from '../hooks/useEventStats';
import type { Event } from '../types';

// Mock the getCollection function
vi.mock('@/core/api/pocketbase', () => ({
  getCollection: vi.fn(),
}));

import { getCollection } from '@/core/api/pocketbase';

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

describe('useEventStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate stats for upcoming events correctly', async () => {
    const now = new Date('2024-06-15');
    vi.setSystemTime(now);

    const mockEvents: Event[] = [
      {
        id: '1',
        title: "John's Birthday",
        event_type: 'birthday',
        event_date: '2024-06-20',
        people_involved: 'John',
        recurring_yearly: true,
        notification_preferences: ['day_of', 'day_before'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        title: 'Anniversary',
        event_type: 'anniversary',
        event_date: '2024-07-01',
        people_involved: 'Jane & Bob',
        recurring_yearly: true,
        notification_preferences: ['week_before'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
      {
        id: '3',
        title: "Sarah's Birthday",
        event_type: 'birthday',
        event_date: '2024-08-15',
        people_involved: 'Sarah',
        recurring_yearly: true,
        notification_preferences: ['day_of'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
    ];

    vi.mocked(getCollection).mockReturnValue({
      getFullList: vi.fn().mockResolvedValue(mockEvents),
    } as unknown as ReturnType<typeof getCollection<Event>>);

    const { result } = renderHook(() => useEventStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const stats = result.current.data!;

    // Total events should be 3
    expect(stats.totalEvents).toBe(3);

    // Upcoming events in next 30 days (June 15 - July 15)
    // John's Birthday (June 20) and Anniversary (July 1) should be upcoming
    expect(stats.upcomingBirthdays).toBe(1);
    expect(stats.upcomingAnniversaries).toBe(1);

    vi.useRealTimers();
  });

  it('should handle recurring yearly events that passed this year', async () => {
    const now = new Date('2024-08-01');
    vi.setSystemTime(now);

    const mockEvents: Event[] = [
      {
        id: '1',
        title: "John's Birthday",
        event_type: 'birthday',
        event_date: '2023-01-15', // Original date in 2023
        people_involved: 'John',
        recurring_yearly: true,
        notification_preferences: ['day_of'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        title: "Sarah's Birthday",
        event_type: 'birthday',
        event_date: '2024-08-15', // Still upcoming this year
        people_involved: 'Sarah',
        recurring_yearly: true,
        notification_preferences: ['day_of'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
    ];

    vi.mocked(getCollection).mockReturnValue({
      getFullList: vi.fn().mockResolvedValue(mockEvents),
    } as unknown as ReturnType<typeof getCollection<Event>>);

    const { result } = renderHook(() => useEventStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const stats = result.current.data!;

    expect(stats.totalEvents).toBe(2);
    // John's birthday already passed this year (Jan 15), won't occur until next year
    // Sarah's birthday is upcoming (Aug 15)
    expect(stats.upcomingBirthdays).toBe(1);
    expect(stats.upcomingAnniversaries).toBe(0);

    vi.useRealTimers();
  });

  it('should handle non-recurring events correctly', async () => {
    const now = new Date('2024-06-15');
    vi.setSystemTime(now);

    const mockEvents: Event[] = [
      {
        id: '1',
        title: 'One-time Event',
        event_type: 'birthday',
        event_date: '2024-06-25',
        people_involved: 'John',
        recurring_yearly: false,
        notification_preferences: ['day_of'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        title: 'Past Event',
        event_type: 'birthday',
        event_date: '2024-06-01',
        people_involved: 'Jane',
        recurring_yearly: false,
        notification_preferences: ['day_of'],
        created_by: 'user-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      },
    ];

    vi.mocked(getCollection).mockReturnValue({
      getFullList: vi.fn().mockResolvedValue(mockEvents),
    } as unknown as ReturnType<typeof getCollection<Event>>);

    const { result } = renderHook(() => useEventStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const stats = result.current.data!;

    expect(stats.totalEvents).toBe(2);
    // Only the one-time event on June 25 should be upcoming
    expect(stats.upcomingBirthdays).toBe(1);

    vi.useRealTimers();
  });

  it('should return zero stats when no events exist', async () => {
    vi.mocked(getCollection).mockReturnValue({
      getFullList: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof getCollection<Event>>);

    const { result } = renderHook(() => useEventStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const stats = result.current.data!;

    expect(stats.totalEvents).toBe(0);
    expect(stats.upcomingBirthdays).toBe(0);
    expect(stats.upcomingAnniversaries).toBe(0);
  });
});
