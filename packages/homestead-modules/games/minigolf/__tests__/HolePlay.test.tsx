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
  it('renders a stepper per player with default par 0 and strokes 0', () => {
    render(
      <HolePlay
        game={makeGame()}
        currentHole={1}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('hole-title')).toHaveTextContent('Hole 1 of 3');
    expect(screen.getByTestId('player-score-a')).toBeInTheDocument();
    expect(screen.getByTestId('player-score-b')).toBeInTheDocument();
    // Par defaults to 0 (unset), strokes default to 0 (invalid placeholder
    // that nudges the user to enter a real value).
    expect(screen.getByTestId('par-value')).toHaveTextContent('0');
    expect(screen.getByTestId('strokes-a-value')).toHaveTextContent('0');
    expect(screen.getByTestId('strokes-b-value')).toHaveTextContent('0');
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
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );

    // Starting from par=0 and strokes=0, bump par to 4, Alice to 4, Bob to 5.
    for (let i = 0; i < 4; i++) await user.click(screen.getByTestId('par-inc'));
    for (let i = 0; i < 4; i++)
      await user.click(screen.getByTestId('strokes-a-inc'));
    for (let i = 0; i < 5; i++)
      await user.click(screen.getByTestId('strokes-b-inc'));

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
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('hole-finish')).toBeInTheDocument();
    expect(screen.queryByTestId('hole-next')).not.toBeInTheDocument();
  });

  it('only offers "Add Another Hole" on the last hole', () => {
    const { rerender } = render(
      <HolePlay
        game={makeGame({ hole_count: 3 })}
        currentHole={2}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.queryByTestId('hole-add')).not.toBeInTheDocument();

    rerender(
      <HolePlay
        game={makeGame({ hole_count: 3 })}
        currentHole={3}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('hole-add')).toBeInTheDocument();
  });

  it('calls onSaveAndAddHole with the current par + scores', async () => {
    const user = userEvent.setup();
    const onSaveAndAddHole = vi.fn();
    render(
      <HolePlay
        game={makeGame({ hole_count: 1 })}
        currentHole={1}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onSaveAndAddHole={onSaveAndAddHole}
        onExit={() => {}}
      />,
    );

    for (let i = 0; i < 3; i++) await user.click(screen.getByTestId('par-inc'));
    for (let i = 0; i < 2; i++)
      await user.click(screen.getByTestId('strokes-a-inc'));
    for (let i = 0; i < 4; i++)
      await user.click(screen.getByTestId('strokes-b-inc'));

    await user.click(screen.getByTestId('hole-add'));

    expect(onSaveAndAddHole).toHaveBeenCalledWith({
      par: 3,
      scores: [
        { player: 'people/a', strokes: 2 },
        { player: 'people/b', strokes: 4 },
      ],
    });
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
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('hole-prev')).toBeDisabled();
  });

  it('does not render cumulative scores on the first hole', () => {
    render(
      <HolePlay
        game={makeGame()}
        currentHole={1}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.queryByTestId('cumulative-scores')).not.toBeInTheDocument();
  });

  it('shows cumulative scores from previous holes when expanded', async () => {
    const user = userEvent.setup();
    const previousHoles: Hole[] = [
      {
        id: 'h1',
        path: 'games/g1/holes/h1',
        hole_number: 1,
        par: 3,
        scores: [
          { player: 'people/a', strokes: 4 },
          { player: 'people/b', strokes: 2 },
        ],
        create_time: '',
        update_time: '',
      },
      {
        id: 'h2',
        path: 'games/g1/holes/h2',
        hole_number: 2,
        par: 4,
        scores: [
          { player: 'people/a', strokes: 5 },
          { player: 'people/b', strokes: 4 },
        ],
        create_time: '',
        update_time: '',
      },
    ];
    render(
      <HolePlay
        game={makeGame()}
        currentHole={3}
        previousHoles={previousHoles}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    const section = screen.getByTestId('cumulative-scores');
    expect(section).toHaveTextContent(/Total through hole 2/i);
    // Collapsed by default — the body and per-player totals are hidden.
    expect(screen.queryByTestId('cumulative-scores-body')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cumulative-a-total')).not.toBeInTheDocument();

    // Expand to see the per-player breakdown.
    await user.click(screen.getByTestId('cumulative-scores-toggle'));

    // Alice: 4 + 5 = 9, Bob: 2 + 4 = 6
    expect(screen.getByTestId('cumulative-a-total')).toHaveTextContent('9');
    expect(screen.getByTestId('cumulative-b-total')).toHaveTextContent('6');
    // Total par = 3 + 4 = 7 ; Alice diff +2, Bob diff -1
    expect(screen.getByTestId('cumulative-a')).toHaveTextContent('+2');
    expect(screen.getByTestId('cumulative-b')).toHaveTextContent('-1');
  });

  it('collapses the cumulative totals panel on toggle', async () => {
    const user = userEvent.setup();
    const previousHoles: Hole[] = [
      {
        id: 'h1',
        path: 'games/g1/holes/h1',
        hole_number: 1,
        par: 3,
        scores: [{ player: 'people/a', strokes: 3 }],
        create_time: '',
        update_time: '',
      },
    ];
    render(
      <HolePlay
        game={makeGame()}
        currentHole={2}
        previousHoles={previousHoles}
        people={people}
        isSaving={false}
        onPrevious={() => {}}
        onSaveAndNext={() => {}}
        onSaveAndFinish={() => {}}
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    const toggle = screen.getByTestId('cumulative-scores-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('cumulative-scores-body')).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('cumulative-scores-body')).not.toBeInTheDocument();
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
        onSaveAndAddHole={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('par-value')).toHaveTextContent('5');
    expect(screen.getByTestId('strokes-a-value')).toHaveTextContent('6');
    expect(screen.getByTestId('strokes-b-value')).toHaveTextContent('4');
  });
});
