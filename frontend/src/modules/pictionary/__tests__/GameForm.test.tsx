import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameForm } from '../components/GameForm';

const PEOPLE = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Carol' },
  { id: 'd', name: 'Dan' },
];

describe('GameForm', () => {
  it('starts with two empty teams and disables submit until rosters are filled', () => {
    render(
      <GameForm
        people={PEOPLE}
        onSubmit={() => {}}
        onCancel={() => {}}
        submitLabel="Save"
      />,
    );
    expect(screen.getByTestId('team-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('team-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('pictionary-submit-button')).toBeDisabled();
  });

  it('submits a game with two teams and a winner', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GameForm
        people={PEOPLE}
        onSubmit={onSubmit}
        onCancel={() => {}}
        submitLabel="Save Game"
      />,
    );

    // Date defaults to today; tweak winning-word + location.
    await user.type(screen.getByTestId('pictionary-location'), 'Orlando');
    await user.type(
      screen.getByTestId('pictionary-winning-word'),
      'Eiffel Tower',
    );

    // Team 0: Alice + Bob (winner)
    await user.click(screen.getByTestId('team-0-player-a'));
    await user.click(screen.getByTestId('team-0-player-b'));
    await user.click(screen.getByTestId('team-0-winner'));

    // Team 1: Carol + Dan
    await user.click(screen.getByTestId('team-1-player-c'));
    await user.click(screen.getByTestId('team-1-player-d'));

    await user.click(screen.getByTestId('pictionary-submit-button'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.location).toBe('Orlando');
    expect(payload.winning_word).toBe('Eiffel Tower');
    expect(payload.teams).toHaveLength(2);
    expect(payload.teams[0].players).toEqual(['people/a', 'people/b']);
    expect(payload.teams[0].won).toBe(true);
    expect(payload.teams[1].players).toEqual(['people/c', 'people/d']);
    expect(payload.teams[1].won).toBe(false);
  });

  it('only one team can be marked the winner', async () => {
    const user = userEvent.setup();
    render(
      <GameForm
        people={PEOPLE}
        onSubmit={() => {}}
        onCancel={() => {}}
        submitLabel="Save"
      />,
    );

    await user.click(screen.getByTestId('team-0-winner'));
    expect(screen.getByTestId('team-0-winner')).toBeChecked();

    await user.click(screen.getByTestId('team-1-winner'));
    expect(screen.getByTestId('team-1-winner')).toBeChecked();
    expect(screen.getByTestId('team-0-winner')).not.toBeChecked();
  });

  it('add team appends a new row that can be removed', async () => {
    const user = userEvent.setup();
    render(
      <GameForm
        people={PEOPLE}
        onSubmit={() => {}}
        onCancel={() => {}}
        submitLabel="Save"
      />,
    );

    await user.click(screen.getByTestId('add-team-button'));
    expect(screen.getByTestId('team-row-2')).toBeInTheDocument();

    await user.click(screen.getByTestId('team-2-remove'));
    expect(screen.queryByTestId('team-row-2')).not.toBeInTheDocument();
  });

  it('cannot remove a team when only the minimum two remain', () => {
    render(
      <GameForm
        people={PEOPLE}
        onSubmit={() => {}}
        onCancel={() => {}}
        submitLabel="Save"
      />,
    );
    expect(screen.queryByTestId('team-0-remove')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-1-remove')).not.toBeInTheDocument();
  });

  it('preloads existing game and teams when editing', () => {
    const onSubmit = vi.fn();
    render(
      <GameForm
        people={PEOPLE}
        initialGame={{
          id: 'g1',
          path: 'pictionary-games/g1',
          played_at: '2024-09-21T00:00:00Z',
          location: 'Michigan',
          winning_word: 'Bite the bullet',
          create_time: '2024-09-21T00:00:00Z',
          update_time: '2024-09-21T00:00:00Z',
        }}
        initialTeams={[
          {
            id: 't1',
            path: 'pictionary-games/g1/pictionary-teams/t1',
            players: ['people/a'],
            won: true,
            create_time: '2024-09-21T00:00:00Z',
            update_time: '2024-09-21T00:00:00Z',
          },
          {
            id: 't2',
            path: 'pictionary-games/g1/pictionary-teams/t2',
            players: ['people/b'],
            won: false,
            create_time: '2024-09-21T00:00:00Z',
            update_time: '2024-09-21T00:00:00Z',
          },
        ]}
        onSubmit={onSubmit}
        onCancel={() => {}}
        submitLabel="Save"
      />,
    );

    expect(
      (screen.getByTestId('pictionary-location') as HTMLInputElement).value,
    ).toBe('Michigan');
    expect(
      (screen.getByTestId('pictionary-winning-word') as HTMLInputElement).value,
    ).toBe('Bite the bullet');
    expect(screen.getByTestId('team-0-winner')).toBeChecked();
    expect(screen.getByTestId('team-1-winner')).not.toBeChecked();
  });
});
