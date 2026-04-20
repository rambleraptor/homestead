import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandForm } from '../components/HandForm';

describe('HandForm', () => {
  it('renders a bid entry block per cardinal direction', () => {
    render(<HandForm onSubmit={() => {}} />);
    expect(screen.getByTestId('bid-north')).toBeInTheDocument();
    expect(screen.getByTestId('bid-south')).toBeInTheDocument();
    expect(screen.getByTestId('bid-east')).toBeInTheDocument();
    expect(screen.getByTestId('bid-west')).toBeInTheDocument();
  });

  it('submits all four bids with selected levels + suits', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HandForm onSubmit={onSubmit} />);

    await user.click(screen.getByTestId('bid-north-level-3'));
    await user.selectOptions(screen.getByTestId('bid-north-suit'), 'spades');

    await user.click(screen.getByTestId('bid-east-level-4'));
    await user.selectOptions(screen.getByTestId('bid-east-suit'), 'no-trump');

    await user.click(screen.getByTestId('bid-south-level-2'));
    await user.selectOptions(screen.getByTestId('bid-south-suit'), 'hearts');

    await user.click(screen.getByTestId('bid-west-level-7'));
    await user.selectOptions(screen.getByTestId('bid-west-suit'), 'diamonds');

    await user.type(screen.getByTestId('hand-notes'), 'slam made');
    await user.click(screen.getByTestId('save-hand-button'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      north_level: 3,
      north_suit: 'spades',
      east_level: 4,
      east_suit: 'no-trump',
      south_level: 2,
      south_suit: 'hearts',
      west_level: 7,
      west_suit: 'diamonds',
      notes: 'slam made',
    });
  });

  it('disables the save button while submitting', () => {
    render(<HandForm onSubmit={() => {}} isSubmitting />);
    expect(screen.getByTestId('save-hand-button')).toBeDisabled();
  });
});
