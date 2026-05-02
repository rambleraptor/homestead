/**
 * Tests for useMerchantSummaries hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useMerchantSummaries } from '../hooks/useMerchantSummaries';
import type { GiftCard } from '../types';

// Mock the useGiftCards hook
vi.mock('../hooks/useGiftCards', () => ({
  useGiftCards: vi.fn(),
}));

import { useGiftCards } from '../hooks/useGiftCards';
import type { UseQueryResult } from '@tanstack/react-query';

const mockGiftCards: GiftCard[] = [
  {
    id: '1',
    path: 'gift-cards/1',
    merchant: 'Amazon',
    card_number: '1234-5678-9012-3456',
    pin: '1234',
    amount: 50.0,
    notes: 'Birthday gift',
    created_by: 'users/user-1',
    create_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    path: 'gift-cards/2',
    merchant: 'Amazon',
    card_number: '2345-6789-0123-4567',
    amount: 25.0,
    created_by: 'users/user-1',
    create_time: '2024-01-02T00:00:00Z',
    update_time: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    path: 'gift-cards/3',
    merchant: 'Starbucks',
    card_number: '3456-7890-1234-5678',
    pin: '5678',
    amount: 15.0,
    notes: 'Coffee card',
    created_by: 'users/user-1',
    create_time: '2024-01-03T00:00:00Z',
    update_time: '2024-01-03T00:00:00Z',
  },
];

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

describe('useMerchantSummaries', () => {
  it('should group gift cards by merchant', async () => {
    vi.mocked(useGiftCards).mockReturnValue({
      data: mockGiftCards,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<GiftCard[]>);

    const { result } = renderHook(() => useMerchantSummaries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.stats).toBeDefined();
    });

    const stats = result.current.stats!;

    // Should have 2 merchants (Amazon and Starbucks)
    expect(stats.merchantCount).toBe(2);

    // Total cards should be 3
    expect(stats.totalCards).toBe(3);

    // Total amount should be 90 (50 + 25 + 15)
    expect(stats.totalAmount).toBe(90.0);

    // Check Amazon merchant
    const amazon = stats.merchants.find((m) => m.merchant === 'Amazon');
    expect(amazon).toBeDefined();
    expect(amazon!.cardCount).toBe(2);
    expect(amazon!.totalAmount).toBe(75.0);
    expect(amazon!.cards).toHaveLength(2);

    // Check Starbucks merchant
    const starbucks = stats.merchants.find((m) => m.merchant === 'Starbucks');
    expect(starbucks).toBeDefined();
    expect(starbucks!.cardCount).toBe(1);
    expect(starbucks!.totalAmount).toBe(15.0);
    expect(starbucks!.cards).toHaveLength(1);
  });

  it('should return undefined stats when no gift cards', async () => {
    vi.mocked(useGiftCards).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<GiftCard[]>);

    const { result } = renderHook(() => useMerchantSummaries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.stats).toBeDefined();
    });

    const stats = result.current.stats!;
    expect(stats.merchantCount).toBe(0);
    expect(stats.totalCards).toBe(0);
    expect(stats.totalAmount).toBe(0);
  });

  it('should return undefined when data is not loaded', () => {
    vi.mocked(useGiftCards).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<GiftCard[]>);

    const { result } = renderHook(() => useMerchantSummaries(), {
      wrapper: createWrapper(),
    });

    expect(result.current.stats).toBeUndefined();
  });

  it('should sort merchants alphabetically', async () => {
    const unsortedCards: GiftCard[] = [
      {
        ...mockGiftCards[0],
        merchant: 'Walmart',
      },
      {
        ...mockGiftCards[1],
        merchant: 'Amazon',
      },
      {
        ...mockGiftCards[2],
        merchant: 'Target',
      },
    ];

    vi.mocked(useGiftCards).mockReturnValue({
      data: unsortedCards,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<GiftCard[]>);

    const { result } = renderHook(() => useMerchantSummaries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.stats).toBeDefined();
    });

    const merchants = result.current.stats!.merchants;
    expect(merchants[0].merchant).toBe('Amazon');
    expect(merchants[1].merchant).toBe('Target');
    expect(merchants[2].merchant).toBe('Walmart');
  });
});
