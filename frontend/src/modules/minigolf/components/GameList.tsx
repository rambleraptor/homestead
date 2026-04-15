'use client';

/**
 * List of past games. Tapping a completed game opens its results.
 * Tapping an in-progress game resumes play from its next unscored hole.
 */

import React from 'react';
import { Flag, Trophy, Play } from 'lucide-react';
import type { Game } from '../types';

interface Person {
  id: string;
  name: string;
}

interface GameListProps {
  games: Game[];
  people: Person[];
  onOpen: (game: Game) => void;
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

export function GameList({ games, people, onOpen }: GameListProps) {
  if (games.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 border border-gray-200 text-center">
        <Flag className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600">
          No games yet. Tap <strong>New Game</strong> to start playing.
        </p>
      </div>
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
              className="w-full text-left bg-white rounded-lg shadow-md p-4 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-4"
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
                  <span className="font-semibold text-gray-900 truncate">
                    {game.location || 'Mini Golf'}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {date}
                  </span>
                </div>
                <div className="text-sm text-gray-600 truncate">{playerNames}</div>
                <div className="text-xs text-gray-500 mt-0.5">
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
