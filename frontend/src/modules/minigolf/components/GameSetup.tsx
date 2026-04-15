'use client';

/**
 * Game setup screen — pick players from the `people` module and choose
 * the number of holes. Player list is a tap-to-toggle chip grid, sized
 * for thumb selection on mobile. Minimum one player required to start.
 */

import React, { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { usePeople } from '@/modules/people/hooks/usePeople';
import { ScoreStepper } from './ScoreStepper';
import type { GameFormData } from '../types';

interface GameSetupProps {
  onStart: (data: GameFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const DEFAULT_HOLE_COUNT = 9;

export function GameSetup({ onStart, onCancel, isSubmitting }: GameSetupProps) {
  const { data: people, isLoading: peopleLoading } = usePeople();
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [holeCount, setHoleCount] = useState<number>(DEFAULT_HOLE_COUNT);
  const [location, setLocation] = useState<string>('');

  const togglePlayer = (personId: string) => {
    const path = `people/${personId}`;
    setSelectedPlayers((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const canStart = selectedPlayers.length > 0 && holeCount > 0 && !isSubmitting;

  const handleStart = () => {
    if (!canStart) return;
    onStart({
      players: selectedPlayers,
      hole_count: holeCount,
      location: location.trim() || undefined,
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="p-2 rounded-md hover:bg-gray-100"
          data-testid="game-setup-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">New Game</h2>
      </div>

      {/* Players */}
      <section className="bg-white rounded-lg shadow-md p-5 border border-gray-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Players</h3>
          <span className="text-sm text-gray-500" data-testid="selected-player-count">
            {selectedPlayers.length} selected
          </span>
        </div>

        {peopleLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !people || people.length === 0 ? (
          <p className="text-sm text-gray-600">
            Add people in the People module first, then come back to start a game.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2" data-testid="player-picker">
            {people.map((person) => {
              const path = `people/${person.id}`;
              const active = selectedPlayers.includes(path);
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => togglePlayer(person.id)}
                  data-testid={`player-toggle-${person.id}`}
                  aria-pressed={active}
                  className={`h-14 px-4 rounded-lg text-base font-medium border-2 transition-colors ${
                    active
                      ? 'bg-accent-terracotta border-accent-terracotta text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {person.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Hole count */}
      <section className="bg-white rounded-lg shadow-md p-5 border border-gray-200 space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Holes</h3>
        <ScoreStepper
          label="Number of holes"
          value={holeCount}
          onChange={setHoleCount}
          min={1}
          max={36}
          size="md"
          testId="hole-count"
        />
      </section>

      {/* Optional location */}
      <section className="bg-white rounded-lg shadow-md p-5 border border-gray-200 space-y-2">
        <label htmlFor="location" className="text-lg font-semibold text-gray-900 block">
          Location <span className="text-sm font-normal text-gray-500">(optional)</span>
        </label>
        <input
          id="location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Riverside Mini Golf"
          data-testid="game-location"
          className="w-full h-12 px-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        />
      </section>

      {/* Start */}
      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        data-testid="start-game-button"
        className="w-full h-14 rounded-lg bg-accent-terracotta hover:bg-accent-terracotta-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-lg shadow-md transition-colors"
      >
        {isSubmitting ? 'Starting…' : 'Start Game'}
      </button>
    </div>
  );
}
