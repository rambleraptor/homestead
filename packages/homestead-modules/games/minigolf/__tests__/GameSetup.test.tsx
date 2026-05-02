import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameSetup } from '../components/GameSetup';

// Mock the people hook — GameSetup consumes it directly.
vi.mock('../../../people/hooks/usePeople', () => ({
  usePeople: vi.fn(),
}));
import { usePeople } from '../../../people/hooks/usePeople';

const mockedUsePeople = vi.mocked(usePeople);

function stubPeople(people: Array<{ id: string; name: string }>) {
  // Minimal shape used by GameSetup; cast is safe because the component
  // reads only id + name.
  mockedUsePeople.mockReturnValue({
    data: people as never,
    isLoading: false,
  } as never);
}

describe('GameSetup', () => {
  beforeEach(() => {
    mockedUsePeople.mockReset();
  });

  it('disables Start when no players are selected', () => {
    stubPeople([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    render(<GameSetup onStart={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('start-game-button')).toBeDisabled();
  });

  it('submits players as people/{id} paths + default hole count', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    stubPeople([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    render(<GameSetup onStart={onStart} onCancel={() => {}} />);

    await user.click(screen.getByTestId('player-toggle-a'));
    await user.click(screen.getByTestId('player-toggle-b'));
    expect(screen.getByTestId('selected-player-count')).toHaveTextContent(
      '2 selected',
    );

    await user.click(screen.getByTestId('start-game-button'));
    expect(onStart).toHaveBeenCalledWith({
      players: ['people/a', 'people/b'],
      hole_count: 9,
      location: undefined,
    });
  });

  it('deselects a player on second tap', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    stubPeople([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    render(<GameSetup onStart={onStart} onCancel={() => {}} />);

    await user.click(screen.getByTestId('player-toggle-a'));
    await user.click(screen.getByTestId('player-toggle-a'));

    expect(screen.getByTestId('selected-player-count')).toHaveTextContent(
      '0 selected',
    );
    expect(screen.getByTestId('start-game-button')).toBeDisabled();
  });

  it('captures an optional location + custom hole count', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    stubPeople([{ id: 'a', name: 'Alice' }]);
    render(<GameSetup onStart={onStart} onCancel={() => {}} />);

    await user.click(screen.getByTestId('player-toggle-a'));
    // Bump hole count 9 -> 12
    await user.click(screen.getByTestId('hole-count-inc'));
    await user.click(screen.getByTestId('hole-count-inc'));
    await user.click(screen.getByTestId('hole-count-inc'));
    await user.type(screen.getByTestId('game-location'), 'Ocean Putt');

    await user.click(screen.getByTestId('start-game-button'));
    expect(onStart).toHaveBeenCalledWith({
      players: ['people/a'],
      hole_count: 12,
      location: 'Ocean Putt',
    });
  });
});
