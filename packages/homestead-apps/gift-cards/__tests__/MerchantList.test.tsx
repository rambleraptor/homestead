/**
 * Tests for MerchantList component
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MerchantList } from '../components/MerchantList';
import type { MerchantSummary, GiftCard } from '../types';

const mockCards: GiftCard[] = [
  {
    id: '1',
    path: 'gift-cards/1',
    merchant: 'Amazon',
    card_number: '1234',
    amount: 50,
    create_time: '2024-01-01',
    update_time: '2024-01-01',
  },
  {
    id: '2',
    path: 'gift-cards/2',
    merchant: 'Amazon',
    card_number: '5678',
    amount: 25,
    create_time: '2024-01-02',
    update_time: '2024-01-02',
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
        path: 'gift-cards/3',
        merchant: 'Starbucks',
        card_number: '9012',
        amount: 15,
        create_time: '2024-01-03',
        update_time: '2024-01-03',
      },
    ],
  },
  {
    merchant: 'Bed Bath & Beyond',
    totalAmount: 10.0,
    cardCount: 1,
    cards: [
      {
        id: '4',
        path: 'gift-cards/4',
        merchant: 'Bed Bath & Beyond',
        card_number: '3456',
        amount: 10,
        create_time: '2024-01-04',
        update_time: '2024-01-04',
      },
    ],
  },
];

const renderList = (merchants: MerchantSummary[]) =>
  render(
    <MemoryRouter>
      <MerchantList merchants={merchants} />
    </MemoryRouter>,
  );

describe('MerchantList', () => {
  it('should render empty state when no merchants', () => {
    renderList([]);

    expect(screen.getByText(/No gift cards yet/i)).toBeInTheDocument();
  });

  it('should render list of merchants', () => {
    renderList(mockMerchants);

    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(screen.getByText('Starbucks')).toBeInTheDocument();
  });

  it('should display correct totals for each merchant', () => {
    renderList(mockMerchants);

    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
  });

  it('should display card counts', () => {
    renderList(mockMerchants);

    expect(screen.getByText('2 cards')).toBeInTheDocument();
    expect(screen.getAllByText('1 card')).toHaveLength(2);
  });

  it("links each merchant to its own page", () => {
    renderList(mockMerchants);

    expect(screen.getByRole('link', { name: /Amazon/ })).toHaveAttribute(
      'href',
      '/gift-cards/merchants/Amazon',
    );
    expect(screen.getByRole('link', { name: /Starbucks/ })).toHaveAttribute(
      'href',
      '/gift-cards/merchants/Starbucks',
    );
  });

  it('percent-encodes a merchant name in its link', () => {
    renderList(mockMerchants);

    expect(screen.getByRole('link', { name: /Bed Bath & Beyond/ })).toHaveAttribute(
      'href',
      '/gift-cards/merchants/Bed%20Bath%20%26%20Beyond',
    );
  });

  it('staggers the rows in, capped so a long list does not keep the last one waiting', () => {
    const many: MerchantSummary[] = Array.from({ length: 12 }, (_, i) => ({
      merchant: `Merchant ${i}`,
      totalAmount: 1,
      cardCount: 1,
      cards: [],
    }));
    renderList(many);

    const rows = screen.getAllByTestId('merchant-row');
    expect(rows[0]).toHaveClass('animate-field-rise');
    expect(rows[0].style.animationDelay).toBe('0ms');
    expect(rows[1].style.animationDelay).toBe('30ms');
    expect(rows[8].style.animationDelay).toBe('240ms');
    expect(rows[11].style.animationDelay).toBe('240ms');
  });
});
