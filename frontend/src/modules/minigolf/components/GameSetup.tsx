'use client';

/**
 * Game setup screen — pick players from the `people` module and choose
 * the number of holes. Players are added via a text-field autocomplete:
 * type to filter, click (or press Enter) to add. Selected players show
 * as removable chips. Minimum one player required to start.
 */

import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, X } from 'lucide-react';
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
  const [search, setSearch] = useState<string>('');
  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const blurTimer = useRef<number | null>(null);

  const peopleById = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of people ?? []) map.set(p.id, { id: p.id, name: p.name });
    return map;
  }, [people]);

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedIds = new Set(
      selectedPlayers.map((path) => path.replace(/^people\//, '')),
    );
    const all = (people ?? []).filter((p) => !selectedIds.has(p.id));
    if (!query) return all.slice(0, 8);
    return all.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 8);
  }, [people, search, selectedPlayers]);

  const addPlayer = (personId: string) => {
    const path = `people/${personId}`;
    setSelectedPlayers((prev) =>
      prev.includes(path) ? prev : [...prev, path],
    );
    setSearch('');
  };

  const removePlayer = (personId: string) => {
    const path = `people/${personId}`;
    setSelectedPlayers((prev) => prev.filter((p) => p !== path));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) addPlayer(matches[0].id);
    } else if (e.key === 'Backspace' && search === '' && selectedPlayers.length > 0) {
      const last = selectedPlayers[selectedPlayers.length - 1];
      const id = last.replace(/^people\//, '');
      removePlayer(id);
    } else if (e.key === 'Escape') {
      setSearch('');
      (e.target as HTMLInputElement).blur();
    }
  };

  // Delay closing the dropdown so option clicks register before blur.
  const handleSearchBlur = () => {
    blurTimer.current = window.setTimeout(() => setSearchFocused(false), 120);
  };
  const handleSearchFocus = () => {
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setSearchFocused(true);
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

  const showDropdown = searchFocused && (people?.length ?? 0) > 0;

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
          <div className="space-y-3">
            {/* Selected players as chips */}
            {selectedPlayers.length > 0 && (
              <div
                className="flex flex-wrap gap-2"
                data-testid="selected-players"
              >
                {selectedPlayers.map((path) => {
                  const id = path.replace(/^people\//, '');
                  const person = peopleById.get(id);
                  if (!person) return null;
                  return (
                    <span
                      key={id}
                      data-testid={`selected-player-${id}`}
                      className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-primary-500 border border-primary-600 text-gray-900 text-sm font-medium"
                    >
                      {person.name}
                      <button
                        type="button"
                        onClick={() => removePlayer(id)}
                        aria-label={`Remove ${person.name}`}
                        data-testid={`remove-player-${id}`}
                        className="p-0.5 rounded-full hover:bg-primary-600/40 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Autocomplete input */}
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                placeholder="Type a name to add a player…"
                aria-label="Search players"
                aria-autocomplete="list"
                data-testid="player-search"
                className="w-full h-12 px-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500"
              />

              {showDropdown && (
                <ul
                  role="listbox"
                  data-testid="player-options"
                  className="absolute z-10 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
                >
                  {matches.length === 0 ? (
                    <li
                      data-testid="player-options-empty"
                      className="px-3 py-2 text-sm text-gray-500"
                    >
                      {search.trim()
                        ? 'No matching people'
                        : 'All players added'}
                    </li>
                  ) : (
                    matches.map((person) => (
                      <li key={person.id} role="option" aria-selected={false}>
                        <button
                          type="button"
                          // onMouseDown so the click fires before input blur.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addPlayer(person.id);
                          }}
                          data-testid={`player-option-${person.id}`}
                          className="w-full text-left px-3 py-2 text-base text-gray-800 hover:bg-gray-100"
                        >
                          {person.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
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
          className="w-full h-12 px-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </section>

      {/* Start */}
      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        data-testid="start-game-button"
        className="w-full h-14 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-semibold text-lg shadow-md transition-colors"
      >
        {isSubmitting ? 'Starting…' : 'Start Game'}
      </button>
    </div>
  );
}
