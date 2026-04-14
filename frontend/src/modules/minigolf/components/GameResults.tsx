'use client';

/**
 * Game results — shows winner + per-hole score grid. Read-only: used
 * both for the "just finished" state and when viewing a historical
 * completed game.
 */

import React, { useState } from 'react';
import { ArrowLeft, Trophy, Flag, Trash2 } from 'lucide-react';
import { computeTotals, computeWinners, computeTotalPar } from '../utils/scoring';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import type { Game, Hole } from '../types';

interface Person {
  id: string;
  name: string;
}

interface GameResultsProps {
  game: Game;
  holes: Hole[];
  people: Person[];
  onBack: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

function displayNameFor(playerPath: string, people: Person[]): string {
  const id = playerPath.replace(/^people\//, '');
  return people.find((p) => p.id === id)?.name || 'Unknown';
}

export function GameResults({
  game,
  holes,
  people,
  onBack,
  onDelete,
  isDeleting = false,
}: GameResultsProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const totals = computeTotals(holes, game.players);
  const winners = computeWinners(totals);
  const totalPar = computeTotalPar(holes);

  const sortedHoles = [...holes].sort((a, b) => a.hole_number - b.hole_number);

  const handleConfirmDelete = () => {
    if (onDelete) onDelete();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          data-testid="results-back"
          className="p-2 rounded-md hover:bg-gray-100"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Results</h2>
        {onDelete && (
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            aria-label="Delete game"
            data-testid="delete-game-button"
            disabled={isDeleting}
            className="ml-auto flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-5 h-5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        )}
      </div>

      {/* Winner */}
      <section
        className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-lg shadow-md p-6 border border-primary-200"
        data-testid="game-winner"
      >
        <div className="flex items-center gap-4">
          <Trophy className="w-10 h-10 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm uppercase font-medium text-gray-600">
              {winners.length > 1 ? 'Tied Winners' : 'Winner'}
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {winners.map((w) => displayNameFor(w, people)).join(', ') || '—'}
            </div>
          </div>
        </div>
      </section>

      {/* Totals */}
      <section className="bg-white rounded-lg shadow-md p-5 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Totals</h3>
        <div className="space-y-2">
          {game.players.map((player) => {
            const id = player.replace(/^people\//, '');
            const total = totals[player] ?? 0;
            const diff = total - totalPar;
            return (
              <div
                key={player}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                data-testid={`total-${id}`}
              >
                <span className="font-medium text-gray-900">
                  {displayNameFor(player, people)}
                </span>
                <span className="tabular-nums">
                  <span className="text-xl font-bold text-gray-900">{total}</span>
                  {totalPar > 0 && (
                    <span className="ml-2 text-sm text-gray-500">
                      ({diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Per-hole breakdown */}
      {sortedHoles.length > 0 && (
        <section className="bg-white rounded-lg shadow-md p-5 border border-gray-200 overflow-x-auto">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Hole by Hole</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-600">
                  <Flag className="w-4 h-4 inline" /> Hole
                </th>
                <th className="text-center py-2 font-medium text-gray-600">Par</th>
                {game.players.map((player) => (
                  <th
                    key={player}
                    className="text-center py-2 font-medium text-gray-600 whitespace-nowrap"
                  >
                    {displayNameFor(player, people)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedHoles.map((hole) => (
                <tr key={hole.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-medium text-gray-900">
                    {hole.hole_number}
                  </td>
                  <td className="text-center tabular-nums text-gray-700">
                    {hole.par}
                  </td>
                  {game.players.map((player) => {
                    const entry = hole.scores.find((s) => s.player === player);
                    return (
                      <td
                        key={player}
                        className="text-center tabular-nums text-gray-900"
                      >
                        {entry?.strokes ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {onDelete && (
        <ConfirmDialog
          isOpen={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Delete Game"
          message="Are you sure you want to delete this game? All hole scores will be removed. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}
