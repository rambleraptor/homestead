import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HolePlay } from '../components/HolePlay';
import type { Game, Hole } from '../types';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    path: 'games/g1',
    players: ['people/a', 'people/b'],
    hole_count: 3,
    completed: false,
    create_time: '',
    update_time: '',
    ...overrides,
  };
}

const people = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
];

describe('HolePlay', () => {
  it('renders a stepper per player and seeds strokes from par by default', () => {
    render(
      <HolePlay
        game={makeGame()}
        currentHole={1}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('hole-title')).toHaveTextContent('Hole 1 of 3');
    expect(screen.getByTestId('player-score-a')).toBeInTheDocument();
    expect(screen.getByTestId('player-score-b')).toBeInTheDocument();
    // Default par is 3, strokes default to par
    expect(screen.getByTestId('par-value')).toHaveTextContent('3');
    expect(screen.getByTestId('strokes-a-value')).toHaveTextContent('3');
    expect(screen.getByTestId('strokes-b-value')).toHaveTextContent('3');
  });

  it('passes the current par + scores when Next is tapped', async () => {
    const user = userEvent.setup();
    const onSaveAndNext = vi.fn();
    render(
      <HolePlay
        game={makeGame()}
        currentHole={1}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={onSaveAndNext}
        onSaveAndFinish={() => {}}
        onExit={() => {}}
      />,
    );

    // Bump par, alice strokes, bob strokes
    await user.click(screen.getByTestId('par-inc')); // 4
    await user.click(screen.getByTestId('strokes-a-inc')); // 4
    await user.click(screen.getByTestId('strokes-b-inc')); // 4
    await user.click(screen.getByTestId('strokes-b-inc')); // 5

    await user.click(screen.getByTestId('hole-next'));

    expect(onSaveAndNext).toHaveBeenCalledWith({
      par: 4,
      scores: [
        { player: 'people/a', strokes: 4 },
        { player: 'people/b', strokes: 5 },
      ],
    });
  });

  it('renders a Finish button on the last hole', () => {
    render(
      <HolePlay
        game={makeGame({ hole_count: 2 })}
        currentHole={2}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('hole-finish')).toBeInTheDocument();
    expect(screen.queryByTestId('hole-next')).not.toBeInTheDocument();
  });

  it('disables the Previous button on hole 1', () => {
    render(
      <HolePlay
        game={makeGame()}
        currentHole={1}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('hole-prev')).toBeDisabled();
  });

  it('seeds par and strokes from an existing hole record', () => {
    const existing: Hole = {
      id: 'h1',
      path: 'games/g1/holes/h1',
      hole_number: 1,
      par: 5,
      scores: [
        { player: 'people/a', strokes: 6 },
        { player: 'people/b', strokes: 4 },
      ],
      create_time: '',
      update_time: '',
    };
    render(
      <HolePlay
        game={makeGame()}
        currentHole={1}
        existingHole={existing}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('par-value')).toHaveTextContent('5');
    expect(screen.getByTestId('strokes-a-value')).toHaveTextContent('6');
    expect(screen.getByTestId('strokes-b-value')).toHaveTextContent('4');
  });
});
