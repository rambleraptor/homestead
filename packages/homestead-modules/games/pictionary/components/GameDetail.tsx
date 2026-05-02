'use client';

/**
 * Pictionary game detail — read-only summary of one game with all teams,
 * highlighting the winner. Provides edit + delete actions.
 */

import React, { useState } from 'react';
import { ArrowLeft, Edit, Trash2, Trophy } from 'lucide-react';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import type { PictionaryGame, PictionaryTeam } from '../types';

interface PersonLite {
  id: string;
  name: string;
}

interface GameDetailProps {
  game: PictionaryGame;
  teams: PictionaryTeam[];
  people: PersonLite[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
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

export function GameDetail({
  game,
  teams,
  people,
  onBack,
  onEdit,
  onDelete,
  isDeleting,
}: GameDetailProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const winningTeam = teams.find((t) => t.won === true);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          data-testid="pictionary-detail-back"
          className="p-2 rounded-md hover:bg-gray-100"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900 flex-1">
          {game.location || 'Pictionary'}
        </h2>
        <button
          type="button"
          onClick={onEdit}
          data-testid="pictionary-edit-button"
          className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium"
        >
          <Edit className="w-4 h-4" />
          <span className="hidden sm:inline">Edit</span>
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label="Delete game"
          data-testid="pictionary-delete-button"
          disabled={isDeleting}
          className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>

      {/* Summary */}
      <section className="bg-white rounded-lg shadow-md p-5 border border-gray-200 space-y-2">
        <div className="text-sm text-gray-600">
          {formatDate(game.played_at || game.create_time)}
        </div>
        {game.winning_word && (
          <div className="text-base">
            <span className="text-gray-500">Winning word: </span>
            <span className="font-medium text-gray-900">
              {game.winning_word}
            </span>
          </div>
        )}
        {game.notes && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {game.notes}
          </p>
        )}
      </section>

      {/* Winner banner */}
      {winningTeam && (
        <section
          className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg shadow-md p-5 border border-amber-200 flex items-center gap-4"
          data-testid="pictionary-winner-banner"
        >
          <Trophy className="w-9 h-9 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-xs uppercase font-medium text-amber-700">
              Winning team
            </div>
            <div className="text-sm text-gray-700">
              {winningTeam.players
                .map((p) => displayNameFor(p, people))
                .join(', ')}
            </div>
          </div>
        </section>
      )}

      {/* Teams */}
      <section
        className="space-y-3"
        data-testid="pictionary-teams-list"
      >
        <h3 className="text-lg font-semibold text-gray-900">
          Teams ({teams.length})
        </h3>
        {teams.length === 0 && (
          <p className="text-sm text-gray-600">No teams recorded.</p>
        )}
        {teams.map((team, index) => (
          <div
            key={team.id}
            data-testid={`pictionary-team-${team.id}`}
            className={`bg-white rounded-lg shadow-sm p-4 border ${
              team.won
                ? 'border-amber-300 ring-1 ring-amber-200'
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-900">
                Team {index + 1}
              </span>
              {team.won && (
                <span className="text-xs font-semibold uppercase text-amber-600 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> Winner
                </span>
              )}
            </div>
            <div className="text-sm text-gray-700 mt-1">
              {team.players.length === 0
                ? '(no players)'
                : team.players
                    .map((p) => displayNameFor(p, people))
                    .join(', ')}
            </div>
          </div>
        ))}
      </section>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onDelete}
        title="Delete Game"
        message="Are you sure you want to delete this Pictionary game? All teams will be removed. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
