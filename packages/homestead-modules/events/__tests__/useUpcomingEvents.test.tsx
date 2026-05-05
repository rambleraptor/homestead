/**
 * Tests for useUpcomingEvents hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('useUpcomingEvents', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns events whose next occurrence falls in the lookahead window', async () => {
    vi.mocked(aepbase.list).mockImplementation(async (plural: string) => {
      if (plural === 'events') {
        return [
          {
            id: 'e1',
            name: "John's Birthday",
            date: '1990-06-20',
            tag: 'birthday',
            people: ['people/p1'],
          },
          {
            id: 'e2',
            name: 'Anniversary',
            date: '2010-08-15',
            tag: 'anniversary',
            people: ['people/p1', 'people/p2'],
          },
        ];
      }
      if (plural === 'people') {
        return [
          { id: 'p1', name: 'John' },
          { id: 'p2', name: 'Jane' },
        ];
      }
      return [];
    });

    const { result } = renderHook(() => useUpcomingEvents(7), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    const upcoming = result.current.data!;
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe('e1');
    expect(upcoming[0].names).toEqual(['John']);
    expect(upcoming[0].tag).toBe('birthday');
  });

  it('handles bare person ids (no `people/` prefix) gracefully', async () => {
    vi.mocked(aepbase.list).mockImplementation(async (plural: string) => {
      if (plural === 'events') {
        return [
          {
            id: 'e1',
            name: 'Test',
            date: '1990-06-20',
            people: ['p1'],
          },
        ];
      }
      if (plural === 'people') {
        return [{ id: 'p1', name: 'John' }];
      }
      return [];
    });

    const { result } = renderHook(() => useUpcomingEvents(7), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data![0].names).toEqual(['John']);
  });

  it('skips events whose next occurrence is outside the window', async () => {
    vi.mocked(aepbase.list).mockImplementation(async (plural: string) => {
      if (plural === 'events') {
        return [
          {
            id: 'e1',
            name: 'Far Away',
            date: '1990-12-25',
            people: [],
          },
        ];
      }
      if (plural === 'people') return [];
      return [];
    });

    const { result } = renderHook(() => useUpcomingEvents(7), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('sorts upcoming events by next occurrence ascending', async () => {
    vi.mocked(aepbase.list).mockImplementation(async (plural: string) => {
      if (plural === 'events') {
        return [
          { id: 'b', name: 'B', date: '1990-06-20', people: [] },
          { id: 'a', name: 'A', date: '1990-06-17', people: [] },
        ];
      }
      if (plural === 'people') return [];
      return [];
    });

    const { result } = renderHook(() => useUpcomingEvents(7), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
