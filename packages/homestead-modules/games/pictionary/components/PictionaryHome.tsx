'use client';

/**
 * Pictionary module root — switches between the games list, the
 * create/edit form, and a detail view. Mirrors the view-state pattern
 * in MinigolfHome / GiftCardHome.
 */

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Loader2, AlertCircle } from 'lucide-react';
import { usePeople } from '../../../people/hooks/usePeople';
import { PageHeader } from '@/shared/components/PageHeader';
import { logger } from '@/core/utils/logger';
import { useGames } from '../hooks/useGames';
import { useGameTeams } from '../hooks/useGameTeams';
import { useGameWinners } from '../hooks/useGameWinners';
import { useCreateGame } from '../hooks/useCreateGame';
import { useUpdateGame } from '../hooks/useUpdateGame';
import { useDeleteGame } from '../hooks/useDeleteGame';
import { GameList } from './GameList';
import { GameForm } from './GameForm';
import { GameDetail } from './GameDetail';
import type {
  PictionaryGame,
  PictionaryGameFormData,
} from '../types';

type View = 'list' | 'create' | 'edit' | 'detail';

export function PictionaryHome() {
  const router = useRouter();
  const [view, setView] = useState<View>('list');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const { data: games, isLoading: gamesLoading, isError, error } = useGames();
  const { data: people } = usePeople();
  const { data: activeTeams } = useGameTeams(
    view === 'edit' || view === 'detail' ? activeGameId : null,
  );
  const gameIds = useMemo(() => (games ?? []).map((g) => g.id), [games]);
  const winnersByGame = useGameWinners(gameIds);

  const createGame = useCreateGame();
  const updateGame = useUpdateGame();
  const deleteGame = useDeleteGame();

  const peopleLite = useMemo(
    () => (people ?? []).map((p) => ({ id: p.id, name: p.name })),
    [people],
  );

  const activeGame = useMemo(
    () => games?.find((g) => g.id === activeGameId) ?? null,
    [games, activeGameId],
  );

  const handleCreate = async (data: PictionaryGameFormData) => {
    try {
      await createGame.mutateAsync(data);
      setView('list');
    } catch (err) {
      logger.error('Failed to create pictionary game', err);
    }
  };

  const handleUpdate = async (data: PictionaryGameFormData) => {
    if (!activeGame) return;
    try {
      await updateGame.mutateAsync({
        id: activeGame.id,
        data,
        existingTeams: activeTeams ?? [],
      });
      setView('detail');
    } catch (err) {
      logger.error('Failed to update pictionary game', err);
    }
  };

  const handleDelete = async () => {
    if (!activeGame) return;
    try {
      await deleteGame.mutateAsync(activeGame.id);
      setActiveGameId(null);
      setView('list');
    } catch (err) {
      logger.error('Failed to delete pictionary game', err);
    }
  };

  const openDetail = (game: PictionaryGame) => {
    setActiveGameId(game.id);
    setView('detail');
  };

  if (gamesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-accent-terracotta animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">
              Failed to load Pictionary games
            </h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {view === 'list' && (
        <>
          <PageHeader
            title="Pictionary"
            subtitle="Record who played, what teams, and who won."
            actions={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/games/pictionary/import')}
                  data-testid="pictionary-import-button"
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium font-body transition-colors shadow-sm"
                >
                  <Upload className="w-5 h-5" />
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setView('create')}
                  data-testid="new-pictionary-game-button"
                  className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  New Game
                </button>
              </div>
            }
          />
          <GameList
            games={games ?? []}
            people={peopleLite}
            winnersByGame={winnersByGame}
            onOpen={openDetail}
          />
        </>
      )}

      {view === 'create' && (
        <GameForm
          people={peopleLite}
          onSubmit={handleCreate}
          onCancel={() => setView('list')}
          isSubmitting={createGame.isPending}
          submitLabel="Save Game"
        />
      )}

      {view === 'edit' && activeGame && (
        <GameForm
          people={peopleLite}
          initialGame={activeGame}
          initialTeams={activeTeams ?? []}
          onSubmit={handleUpdate}
          onCancel={() => setView('detail')}
          isSubmitting={updateGame.isPending}
          submitLabel="Save Changes"
        />
      )}

      {view === 'detail' && activeGame && (
        <GameDetail
          game={activeGame}
          teams={activeTeams ?? []}
          people={peopleLite}
          onBack={() => {
            setActiveGameId(null);
            setView('list');
          }}
          onEdit={() => setView('edit')}
          onDelete={handleDelete}
          isDeleting={deleteGame.isPending}
        />
      )}
    </div>
  );
}
