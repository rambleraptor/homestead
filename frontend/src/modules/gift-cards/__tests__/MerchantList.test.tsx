/**
 * Tests for MerchantList component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MerchantList } from '../components/MerchantList';
import type { MerchantSummary, GiftCard } from '../types';

const mockCards: GiftCard[] = [
  {
    id: '1',
    merchant: 'Amazon',
    card_number: '1234',
    amount: 50,
    created: '2024-01-01',
    updated: '2024-01-01',
  },
  {
    id: '2',
    merchant: 'Amazon',
    card_number: '5678',
    amount: 25,
    created: '2024-01-02',
    updated: '2024-01-02',
  },
];

const mockMerchants: MerchantSummary[] = [
  {
    merchant: 'Amazon',
    totalAmount: 75.0,
    cardCount: 2,
    cards: mockCards,
  },
  {
    merchant: 'Starbucks',
    totalAmount: 15.0,
    cardCount: 1,
    cards: [
      {
        id: '3',
        merchant: 'Starbucks',
        card_number: '9012',
        amount: 15,
        created: '2024-01-03',
        updated: '2024-01-03',
      },
    ],
  },
];

describe('MerchantList', () => {
  it('should render empty state when no merchants', () => {
    const onMerchantClick = vi.fn();
    render(<MerchantList merchants={[]} onMerchantClick={onMerchantClick} />);

    expect(screen.getByText(/No gift cards yet/i)).toBeInTheDocument();
  });

  it('should render list of merchants', () => {
    const onMerchantClick = vi.fn();
    render(<MerchantList merchants={mockMerchants} onMerchantClick={onMerchantClick} />);

    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(screen.getByText('Starbucks')).toBeInTheDocument();
  });

  it('should display correct totals for each merchant', () => {
    const onMerchantClick = vi.fn();
    render(<MerchantList merchants={mockMerchants} onMerchantClick={onMerchantClick} />);

    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
  });

  it('should display card counts', () => {
    const onMerchantClick = vi.fn();
    render(<MerchantList merchants={mockMerchants} onMerchantClick={onMerchantClick} />);

    expect(screen.getByText('2 cards')).toBeInTheDocument();
    expect(screen.getByText('1 card')).toBeInTheDocument();
  });

  it('should call onMerchantClick when merchant is clicked', async () => {
    const user = userEvent.setup();
    const onMerchantClick = vi.fn();
    render(<MerchantList merchants={mockMerchants} onMerchantClick={onMerchantClick} />);

    const amazonButton = screen.getByText('Amazon').closest('button');
    expect(amazonButton).toBeInTheDocument();

    await user.click(amazonButton!);

    expect(onMerchantClick).toHaveBeenCalledWith('Amazon');
    expect(onMerchantClick).toHaveBeenCalledTimes(1);
  });

  it('should handle clicking different merchants', async () => {
    const user = userEvent.setup();
    const onMerchantClick = vi.fn();
    render(<MerchantList merchants={mockMerchants} onMerchantClick={onMerchantClick} />);

    const amazonButton = screen.getByText('Amazon').closest('button');
    const starbucksButton = screen.getByText('Starbucks').closest('button');

    await user.click(amazonButton!);
    expect(onMerchantClick).toHaveBeenCalledWith('Amazon');

    await user.click(starbucksButton!);
    expect(onMerchantClick).toHaveBeenCalledWith('Starbucks');

    expect(onMerchantClick).toHaveBeenCalledTimes(2);
  });
});
