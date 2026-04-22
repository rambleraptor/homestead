import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandForm } from '../components/HandForm';

describe('HandForm', () => {
  it('renders level, suit, and direction button rows', () => {
    render(<HandForm onSubmit={() => {}} />);
    expect(screen.getByTestId('level-1')).toBeInTheDocument();
    expect(screen.getByTestId('level-7')).toBeInTheDocument();
    expect(screen.getByTestId('suit-clubs')).toBeInTheDocument();
    expect(screen.getByTestId('suit-no-trump')).toBeInTheDocument();
    expect(screen.getByTestId('suit-pass')).toBeInTheDocument();
    expect(screen.getByTestId('direction-north')).toBeInTheDocument();
    expect(screen.getByTestId('direction-east')).toBeInTheDocument();
    expect(screen.getByTestId('direction-south')).toBeInTheDocument();
    expect(screen.getByTestId('direction-west')).toBeInTheDocument();
  });

  it('starts with no level or suit selected', () => {
    render(<HandForm onSubmit={() => {}} />);
    for (const lvl of [1, 2, 3, 4, 5, 6, 7] as const) {
      expect(screen.getByTestId(`level-${lvl}`)).toHaveAttribute('aria-checked', 'false');
    }
    for (const s of ['clubs', 'diamonds', 'hearts', 'spades', 'no-trump', 'pass'] as const) {
      expect(screen.getByTestId(`suit-${s}`)).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('disables direction buttons until level + suit are chosen', async () => {
    const user = userEvent.setup();
    render(<HandForm onSubmit={() => {}} />);

    expect(screen.getByTestId('direction-north')).toBeDisabled();

    await user.click(screen.getByTestId('level-3'));
    expect(screen.getByTestId('direction-north')).toBeDisabled();

    await user.click(screen.getByTestId('suit-spades'));
    expect(screen.getByTestId('direction-north')).not.toBeDisabled();
  });

  it('commits the active level + suit to the tapped direction', async () => {
    const user = userEvent.setup();
    render(<HandForm onSubmit={() => {}} />);

    await user.click(screen.getByTestId('level-3'));
    await user.click(screen.getByTestId('suit-spades'));
    await user.click(screen.getByTestId('direction-north'));

    expect(screen.getByTestId('direction-north-bid')).toHaveTextContent('3♠');
    expect(screen.getByTestId('direction-north')).toBeDisabled();
  });

  it('clears level + suit selection after each direction is committed', async () => {
    const user = userEvent.setup();
    render(<HandForm onSubmit={() => {}} />);

    await user.click(screen.getByTestId('level-3'));
    await user.click(screen.getByTestId('suit-spades'));
    await user.click(screen.getByTestId('direction-north'));

    expect(screen.getByTestId('level-3')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('suit-spades')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('direction-east')).toBeDisabled();
  });

  it('commits pass without requiring a level', async () => {
    const user = userEvent.setup();
    render(<HandForm onSubmit={() => {}} />);

    await user.click(screen.getByTestId('suit-pass'));
    expect(screen.getByTestId('direction-north')).not.toBeDisabled();

    await user.click(screen.getByTestId('direction-north'));
    expect(screen.getByTestId('direction-north-bid')).toHaveTextContent('Pass');
  });

  it('submits all four bids once every direction is entered', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HandForm onSubmit={onSubmit} />);

    await user.click(screen.getByTestId('level-3'));
    await user.click(screen.getByTestId('suit-spades'));
    await user.click(screen.getByTestId('direction-north'));

    await user.click(screen.getByTestId('level-4'));
    await user.click(screen.getByTestId('suit-no-trump'));
    await user.click(screen.getByTestId('direction-east'));

    await user.click(screen.getByTestId('level-2'));
    await user.click(screen.getByTestId('suit-hearts'));
    await user.click(screen.getByTestId('direction-south'));

    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('suit-pass'));
    await user.click(screen.getByTestId('direction-west'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      north_level: 3,
      north_suit: 'spades',
      east_level: 4,
      east_suit: 'no-trump',
      south_level: 2,
      south_suit: 'hearts',
      west_level: undefined,
      west_suit: 'pass',
    });
  });

  it('resets the direction buttons after submission', async () => {
    const user = userEvent.setup();
    render(<HandForm onSubmit={() => {}} />);

    for (const dir of ['north', 'east', 'south', 'west'] as const) {
      await user.click(screen.getByTestId('suit-pass'));
      await user.click(screen.getByTestId(`direction-${dir}`));
    }

    expect(screen.getByTestId('direction-north')).toBeDisabled();
    expect(screen.getByTestId('direction-east')).toBeDisabled();
    expect(screen.getByTestId('direction-south')).toBeDisabled();
    expect(screen.getByTestId('direction-west')).toBeDisabled();
    expect(screen.queryByTestId('direction-north-bid')).toBeNull();
    expect(screen.getByTestId('suit-pass')).toHaveAttribute('aria-checked', 'false');
  });

  it('ignores repeat taps on an already-entered direction', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HandForm onSubmit={onSubmit} />);

    await user.click(screen.getByTestId('level-3'));
    await user.click(screen.getByTestId('suit-spades'));
    await user.click(screen.getByTestId('direction-north'));

    await user.click(screen.getByTestId('level-5'));
    await user.click(screen.getByTestId('suit-hearts'));
    await user.click(screen.getByTestId('direction-north'));

    expect(screen.getByTestId('direction-north-bid')).toHaveTextContent('3♠');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables every direction while submitting', () => {
    render(<HandForm onSubmit={() => {}} isSubmitting />);
    expect(screen.getByTestId('direction-north')).toBeDisabled();
    expect(screen.getByTestId('direction-east')).toBeDisabled();
    expect(screen.getByTestId('direction-south')).toBeDisabled();
    expect(screen.getByTestId('direction-west')).toBeDisabled();
  });
});
