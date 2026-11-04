/**
 * List of past games. Tapping a completed game opens its results.
 * Tapping an in-progress game resumes play from its next unscored hole.
 */

import { Flag, Trophy, Play } from 'lucide-react';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import type { Game } from '../types';

interface Person {
  id: string;
  name: string;
}

interface GameListProps {
  games: Game[];
  people: Person[];
  onOpen: (game: Game) => void;
  /** Starts a new game; offered by the empty state. */
  onNew?: () => void;
}

function displayNameFor(playerPath: string, people: Person[]): string {
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

export function GameList({ games, people, onOpen, onNew }: GameListProps) {
  if (games.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="No games yet"
        description="Start a game to score it hole by hole and see who wins."
        action={onNew ? { label: 'New game', onClick: onNew, testId: 'minigolf-empty-new' } : undefined}
        data-testid="minigolf-empty"
      />
    );
  }

  return (
    <ul className="space-y-3" data-testid="game-list">
      {games.map((game) => {
        const date = formatDate(game.played_at || game.create_time);
        const playerNames = game.players
          .map((p) => displayNameFor(p, people))
          .join(', ');
        return (
          <li key={game.id}>
            <button
              type="button"
              onClick={() => onOpen(game)}
              data-testid={`game-item-${game.id}`}
              className="w-full text-left bg-surface-white rounded-2xl shadow-md p-4 border border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-4"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-accent-terracotta/10 flex items-center justify-center">
                {game.completed ? (
                  <Trophy className="w-6 h-6 text-amber-500" />
                ) : (
                  <Play className="w-6 h-6 text-accent-terracotta" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-brand-navy truncate">
                    {game.location || 'Mini Golf'}
                  </span>
                  <span className="text-xs text-text-muted whitespace-nowrap">
                    {date}
                  </span>
                </div>
                <div className="text-sm text-text-muted truncate">{playerNames}</div>
                <div className="text-xs text-text-muted mt-0.5">
                  {game.hole_count} holes ·{' '}
                  {game.completed ? 'Completed' : 'In progress'}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
