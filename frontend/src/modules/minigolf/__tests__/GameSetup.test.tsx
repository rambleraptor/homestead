import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameSetup } from '../components/GameSetup';

// Mock the people hook — GameSetup consumes it directly.
vi.mock('@/modules/people/hooks/usePeople', () => ({
  usePeople: vi.fn(),
}));
import { usePeople } from '@/modules/people/hooks/usePeople';

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

  it('adds players via autocomplete and submits as people/{id} paths', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    stubPeople([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    render(<GameSetup onStart={onStart} onCancel={() => {}} />);

    const search = screen.getByTestId('player-search');
    await user.click(search);
    await user.type(search, 'ali');
    await user.click(screen.getByTestId('player-option-a'));

    // Search is cleared after selection; type again to add Bob.
    await user.type(search, 'bo');
    await user.click(screen.getByTestId('player-option-b'));

    expect(screen.getByTestId('selected-player-count')).toHaveTextContent(
      '2 selected',
    );
    expect(screen.getByTestId('selected-player-a')).toHaveTextContent('Alice');
    expect(screen.getByTestId('selected-player-b')).toHaveTextContent('Bob');

    await user.click(screen.getByTestId('start-game-button'));
    expect(onStart).toHaveBeenCalledWith({
      players: ['people/a', 'people/b'],
      hole_count: 9,
      location: undefined,
    });
  });

  it('removes a player via the chip remove button', async () => {
    const user = userEvent.setup();
    stubPeople([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    render(<GameSetup onStart={() => {}} onCancel={() => {}} />);

    const search = screen.getByTestId('player-search');
    await user.click(search);
    await user.click(screen.getByTestId('player-option-a'));
    await user.click(screen.getByTestId('remove-player-a'));

    expect(screen.getByTestId('selected-player-count')).toHaveTextContent(
      '0 selected',
    );
    expect(screen.queryByTestId('selected-player-a')).toBeNull();
    expect(screen.getByTestId('start-game-button')).toBeDisabled();
  });

  it('hides already-selected players from the dropdown', async () => {
    const user = userEvent.setup();
    stubPeople([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    render(<GameSetup onStart={() => {}} onCancel={() => {}} />);

    const search = screen.getByTestId('player-search');
    await user.click(search);
    await user.click(screen.getByTestId('player-option-a'));

    // Re-focus and confirm Alice is no longer offered.
    await user.click(search);
    expect(screen.queryByTestId('player-option-a')).toBeNull();
    expect(screen.getByTestId('player-option-b')).toBeVisible();
  });

  it('Enter selects the first match', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    stubPeople([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    render(<GameSetup onStart={onStart} onCancel={() => {}} />);

    const search = screen.getByTestId('player-search');
    await user.click(search);
    await user.type(search, 'bo{Enter}');

    expect(screen.getByTestId('selected-player-b')).toHaveTextContent('Bob');
  });

  it('captures an optional location + custom hole count', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    stubPeople([{ id: 'a', name: 'Alice' }]);
    render(<GameSetup onStart={onStart} onCancel={() => {}} />);

    const search = screen.getByTestId('player-search');
    await user.click(search);
    await user.click(screen.getByTestId('player-option-a'));
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
