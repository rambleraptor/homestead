import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandCard } from '../components/HandCard';
import type { Hand } from '../types';

const BASE: Hand = {
  id: 'hand-1',
  path: 'hands/hand-1',
  create_time: '2026-04-20T12:00:00Z',
  update_time: '2026-04-20T12:00:00Z',
  north_level: 3,
  north_suit: 'spades',
  south_level: 4,
  south_suit: 'hearts',
  east_level: 2,
  east_suit: 'no-trump',
  west_level: 1,
  west_suit: 'clubs',
  notes: 'doubled',
};

describe('HandCard', () => {
  it('renders every direction with its formatted bid', () => {
    render(<HandCard hand={BASE} />);
    expect(screen.getByTestId('hand-hand-1-north-bid')).toHaveTextContent('3♠');
    expect(screen.getByTestId('hand-hand-1-south-bid')).toHaveTextContent('4♥');
    expect(screen.getByTestId('hand-hand-1-east-bid')).toHaveTextContent('2 NT');
    expect(screen.getByTestId('hand-hand-1-west-bid')).toHaveTextContent('1♣');
  });

  it('renders notes when present', () => {
    render(<HandCard hand={BASE} />);
    expect(screen.getByTestId('hand-hand-1-notes')).toHaveTextContent('doubled');
  });

  it('fires onDelete with the hand id', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<HandCard hand={BASE} onDelete={onDelete} />);
    await user.click(screen.getByTestId('hand-hand-1-delete'));
    expect(onDelete).toHaveBeenCalledWith('hand-1');
  });

  it('hides the delete button when no handler is provided', () => {
    render(<HandCard hand={BASE} />);
    expect(screen.queryByTestId('hand-hand-1-delete')).toBeNull();
  });

  it('renders a pass bid as "Pass"', () => {
    const hand: Hand = {
      ...BASE,
      west_level: undefined,
      west_suit: 'pass',
    };
    render(<HandCard hand={hand} />);
    expect(screen.getByTestId('hand-hand-1-west-bid')).toHaveTextContent('Pass');
  });
});
