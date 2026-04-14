'use client';

/**
 * Minigolf module root — view switcher between list, setup, play and
 * results. Mirrors the view-state pattern used by GiftCardHome.
 *
 * Resuming an in-progress game picks up at the lowest hole number
 * that doesn't yet have a saved record (or hole 1 if none).
 */

import React, { useMemo, useState } from 'react';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { usePeople } from '@/modules/people/hooks/usePeople';
import { useGames } from '../hooks/useGames';
import { useCreateGame } from '../hooks/useCreateGame';
import { useUpdateGame } from '../hooks/useUpdateGame';
import { useGameHoles } from '../hooks/useGameHoles';
import { useCreateHole } from '../hooks/useCreateHole';
import { useUpdateHole } from '../hooks/useUpdateHole';
import { useDeleteGame } from '../hooks/useDeleteGame';
import { GameList } from './GameList';
import { GameSetup } from './GameSetup';
import { HolePlay } from './HolePlay';
import { GameResults } from './GameResults';
import { logger } from '@/core/utils/logger';
import type { Game, GameFormData, Hole, PlayerScore } from '../types';

type View = 'list' | 'setup' | 'play' | 'results';

function nextUnscoredHole(holes: Hole[], holeCount: number): number {
  const scored = new Set(holes.map((h) => h.hole_number));
  for (let i = 1; i <= holeCount; i++) {
    if (!scored.has(i)) return i;
  }
  return holeCount; // all scored — park on the last
}

export function MinigolfHome() {
  const [view, setView] = useState<View>('list');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [currentHole, setCurrentHole] = useState<number>(1);

  const { data: games, isLoading: gamesLoading, isError, error } = useGames();
  const { data: people } = usePeople();
  const activeGame = useMemo(
    () => games?.find((g) => g.id === activeGameId) ?? null,
    [games, activeGameId],
  );
  const { data: holes } = useGameHoles(activeGameId);

  const createGame = useCreateGame();
  const updateGame = useUpdateGame();
  const createHole = useCreateHole();
  const updateHole = useUpdateHole();
  const deleteGame = useDeleteGame();

  const peopleLite = useMemo(
    () => (people ?? []).map((p) => ({ id: p.id, name: p.name })),
    [people],
  );

  const handleStartNewGame = async (data: GameFormData) => {
    try {
      const game = await createGame.mutateAsync(data);
      setActiveGameId(game.id);
      setCurrentHole(1);
      setView('play');
    } catch (err) {
      logger.error('Failed to start new game', err);
    }
  };

  const handleOpenGame = (game: Game) => {
    setActiveGameId(game.id);
    if (game.completed) {
      setView('results');
    } else {
      // Fetched holes may be stale for a freshly opened game; HolePlay
      // reseeds from `existingHole` once the query resolves. For the
      // initial jump, best-effort from the last known data.
      const resumeAt = nextUnscoredHole(holes ?? [], game.hole_count);
      setCurrentHole(resumeAt);
      setView('play');
    }
  };

  const findHole = (holeNumber: number): Hole | undefined =>
    (holes ?? []).find((h) => h.hole_number === holeNumber);

  const persistHole = async (
    game: Game,
    holeNumber: number,
    payload: { par: number; scores: PlayerScore[] },
  ) => {
    const existing = findHole(holeNumber);
    if (existing) {
      await updateHole.mutateAsync({
        gameId: game.id,
        holeId: existing.id,
        data: payload,
      });
    } else {
      await createHole.mutateAsync({
        gameId: game.id,
        data: { hole_number: holeNumber, ...payload },
      });
    }
  };

  const handleSaveAndNext = async (payload: {
    par: number;
    scores: PlayerScore[];
  }) => {
    if (!activeGame) return;
    try {
      await persistHole(activeGame, currentHole, payload);
      setCurrentHole((h) => Math.min(activeGame.hole_count, h + 1));
    } catch (err) {
      logger.error('Failed to save hole', err);
    }
  };

  const handleSaveAndFinish = async (payload: {
    par: number;
    scores: PlayerScore[];
  }) => {
    if (!activeGame) return;
    try {
      await persistHole(activeGame, currentHole, payload);
      await updateGame.mutateAsync({
        id: activeGame.id,
        data: { completed: true },
      });
      setView('results');
    } catch (err) {
      logger.error('Failed to finish game', err);
    }
  };

  const handlePrevious = () => {
    setCurrentHole((h) => Math.max(1, h - 1));
  };

  const handleExitGame = () => {
    // Leaving mid-game keeps any saved holes so the user can resume.
    setActiveGameId(null);
    setView('list');
  };

  const handleBackFromResults = () => {
    setActiveGameId(null);
    setView('list');
  };

  const handleDeleteGame = async () => {
    if (!activeGame) return;
    try {
      await deleteGame.mutateAsync(activeGame.id);
      setActiveGameId(null);
      setView('list');
    } catch (err) {
      logger.error('Failed to delete game', err);
    }
  };

  if (gamesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Failed to load games</h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const saving =
    createHole.isPending || updateHole.isPending || updateGame.isPending;

  return (
    <div className="space-y-6">
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Mini Golf</h1>
              <p className="mt-2 text-gray-600">
                Score games hole-by-hole and track winners.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setView('setup')}
              data-testid="new-game-button"
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-gray-900 rounded-lg font-medium transition-colors shadow-md"
            >
              <Plus className="w-5 h-5" />
              New Game
            </button>
          </div>

          <GameList
            games={games ?? []}
            people={peopleLite}
            onOpen={handleOpenGame}
          />
        </>
      )}

      {view === 'setup' && (
        <GameSetup
          onStart={handleStartNewGame}
          onCancel={() => setView('list')}
          isSubmitting={createGame.isPending}
        />
      )}

      {view === 'play' && activeGame && (
        <HolePlay
          // Force remount on hole change so local stepper state reseeds
          // cleanly from the new hole's record (or defaults).
          key={`${activeGame.id}-${currentHole}-${findHole(currentHole)?.id ?? 'new'}`}
          game={activeGame}
          currentHole={currentHole}
          existingHole={findHole(currentHole)}
          people={peopleLite}
          isSaving={saving}
          onPrevious={handlePrevious}
          onSaveAndNext={handleSaveAndNext}
          onSaveAndFinish={handleSaveAndFinish}
          onExit={handleExitGame}
        />
      )}

      {view === 'results' && activeGame && (
        <GameResults
          game={activeGame}
          holes={holes ?? []}
          people={peopleLite}
          onBack={handleBackFromResults}
          onDelete={handleDeleteGame}
          isDeleting={deleteGame.isPending}
        />
      )}
    </div>
  );
}
