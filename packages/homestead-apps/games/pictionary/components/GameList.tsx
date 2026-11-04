/**
 * Pictionary games list. Each row shows the game's date, location,
 * winning word, and the winning team's roster. Tapping opens the detail
 * view.
 */

import { Pencil, Trophy } from 'lucide-react';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { Link } from 'react-router-dom';
import type { PictionaryGame, PictionaryTeam } from '../types';

interface PersonLite {
  id: string;
  name: string;
}

interface GameListProps {
  games: PictionaryGame[];
  people?: PersonLite[];
  /** Map of gameId -> winning team (undefined if unknown / no winner). */
  winnersByGame?: Record<string, PictionaryTeam | undefined>;
  onOpen: (game: PictionaryGame) => void;
  /** Starts recording a new game; offered by the empty state. */
  onNew?: () => void;
}

function displayNameFor(playerPath: string, people: PersonLite[]): string {
  const id = playerPath.replace(/^people\//, '');
  return people.find((p) => p.id === id)?.name || 'Unknown';
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function GameList({
  games,
  people = [],
  winnersByGame = {},
  onOpen,
  onNew,
}: GameListProps) {
  if (games.length === 0) {
    return (
      <EmptyState
        icon={Pencil}
        title="No Pictionary games yet"
        description="Record who played on which team, the winning word, and who won."
        action={
          onNew ? { label: 'New game', onClick: onNew, testId: 'pictionary-empty-new' } : undefined
        }
        secondaryAction={
          <Link
            to="/games/pictionary/import"
            className="text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover"
          >
            Import from a spreadsheet
          </Link>
        }
        data-testid="pictionary-empty"
      />
    );
  }

  return (
    <ul className="space-y-3" data-testid="pictionary-game-list">
      {games.map((game) => {
        const date = formatDate(game.played_at || game.create_time);
        const winner = winnersByGame[game.id];
        const winnerNames =
          winner && winner.players.length > 0
            ? winner.players.map((p) => displayNameFor(p, people)).join(', ')
            : '';
        return (
          <li key={game.id}>
            <button
              type="button"
              onClick={() => onOpen(game)}
              data-testid={`pictionary-game-item-${game.id}`}
              className="w-full text-left bg-surface-white rounded-2xl shadow-md p-4 border border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-4"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-accent-terracotta/10 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-brand-navy truncate">
                    {game.location || 'Pictionary'}
                  </span>
                  <span className="text-xs text-text-muted whitespace-nowrap">
                    {date}
                  </span>
                </div>
                {game.winning_word && (
                  <div className="text-sm text-text-muted truncate">
                    Winning word:{' '}
                    <span className="font-medium text-gray-800">
                      {game.winning_word}
                    </span>
                  </div>
                )}
                {winnerNames && (
                  <div
                    className="text-sm text-text-muted truncate"
                    data-testid={`pictionary-game-winner-${game.id}`}
                  >
                    Winning team:{' '}
                    <span className="font-medium text-gray-800">
                      {winnerNames}
                    </span>
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
