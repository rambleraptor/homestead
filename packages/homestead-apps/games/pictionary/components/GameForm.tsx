/**
 * Pictionary game form — captures the game record (date, location,
 * winning word, notes) plus a dynamic list of teams. Each team has a
 * multi-select roster of People and a "winner" radio. Teams have no
 * name; they're identified by position. Used for both create and edit;
 * passing `initialGame` + `initialTeams` switches it to edit mode.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import {
  PersonSelector,
  type PersonOption,
} from '@rambleraptor/homestead-core/shared/components/PersonSelector';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useFavorites } from '@rambleraptor/homestead-core/shared/favorites';
import { validateImageFile } from '@rambleraptor/homestead-core/shared/utils/fileValidation';
import { useWinningWordImageUrl } from '../hooks/useWinningWordImageUrl';
import type {
  PictionaryGame,
  PictionaryGameFormData,
  PictionaryTeam,
  PictionaryTeamFormData,
} from '../types';

type PersonLite = PersonOption;

interface GameFormProps {
  people: PersonLite[];
  initialGame?: PictionaryGame;
  initialTeams?: PictionaryTeam[];
  onSubmit: (data: PictionaryGameFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitLabel: string;
}

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoToDateInput(iso?: string): string {
  if (!iso) return todayDateInput();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayDateInput();
  return d.toISOString().slice(0, 10);
}

function dateInputToIso(value: string): string {
  // Anchor to midnight UTC so the date round-trips cleanly.
  if (!value) return new Date().toISOString();
  return new Date(`${value}T00:00:00Z`).toISOString();
}

function blankTeam(): PictionaryTeamFormData {
  return {
    players: [],
    won: false,
  };
}

function teamFromRecord(team: PictionaryTeam): PictionaryTeamFormData {
  return {
    id: team.id,
    players: team.players,
    won: team.won === true,
    rank: team.rank,
  };
}

export function GameForm({
  people,
  initialGame,
  initialTeams,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: GameFormProps) {
  const personFavorites = useFavorites('person');
  const [date, setDate] = useState(isoToDateInput(initialGame?.played_at));
  const [location, setLocation] = useState(initialGame?.location ?? '');
  const [winningWord, setWinningWord] = useState(
    initialGame?.winning_word ?? '',
  );
  const [notes, setNotes] = useState(initialGame?.notes ?? '');
  const [teams, setTeams] = useState<PictionaryTeamFormData[]>(() => {
    if (initialTeams && initialTeams.length > 0) {
      return initialTeams.map(teamFromRecord);
    }
    return [blankTeam(), blankTeam()];
  });

  const toast = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploadUrl, setImageUploadUrl] = useState<string | null>(null);
  const remoteImageUrl = useWinningWordImageUrl(initialGame ?? null);
  const imagePreviewUrl = imageUploadUrl ?? remoteImageUrl;

  useEffect(() => {
    return () => {
      if (imageUploadUrl) URL.revokeObjectURL(imageUploadUrl);
    };
  }, [imageUploadUrl]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error!);
      return;
    }
    setImageFile(file);
    setImageUploadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImageUploadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const errors = useMemo(() => {
    const out: string[] = [];
    if (teams.length < 2) out.push('At least two teams are required.');
    if (teams.some((t) => t.players.length === 0)) {
      out.push('Every team needs at least one player.');
    }
    return out;
  }, [teams]);

  const canSubmit = errors.length === 0 && !isSubmitting;

  const setWinner = (index: number) => {
    setTeams((prev) => prev.map((t, i) => ({ ...t, won: i === index })));
  };

  const togglePlayer = (teamIndex: number, personId: string) => {
    const path = `people/${personId}`;
    setTeams((prev) =>
      prev.map((t, i) => {
        if (i !== teamIndex) return t;
        const has = t.players.includes(path);
        return {
          ...t,
          players: has
            ? t.players.filter((p) => p !== path)
            : [...t.players, path],
        };
      }),
    );
  };

  const addTeam = () => {
    setTeams((prev) => [...prev, blankTeam()]);
  };

  const removeTeam = (index: number) => {
    setTeams((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, i) => i !== index);
      // Make sure at least one team is still flagged as winner if any
      // were before; otherwise clear.
      if (!next.some((t) => t.won) && prev[index]?.won) {
        // Winner removed — leave it cleared, the user can re-pick.
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      played_at: dateInputToIso(date),
      location: location.trim() || undefined,
      winning_word: winningWord.trim() || undefined,
      notes: notes.trim() || undefined,
      teams,
      winning_word_image: imageFile ?? undefined,
    });
  };

  return (
    <form
      className="max-w-2xl mx-auto space-y-6"
      onSubmit={handleSubmit}
      data-testid="pictionary-game-form"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          data-testid="pictionary-form-back"
          className="p-2 rounded-md hover:bg-gray-100"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold text-brand-navy">
          {initialGame ? 'Edit Game' : 'New Pictionary Game'}
        </h2>
      </div>

      {/* Game record fields */}
      <section className="bg-surface-white rounded-2xl shadow-md p-5 border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">
            Date played
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="pictionary-date"
            className="w-full h-11 px-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
            required
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">
            Location <span className="text-gray-400">(optional)</span>
          </span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Orlando"
            data-testid="pictionary-location"
            className="w-full h-11 px-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium text-gray-700">
            Winning word <span className="text-gray-400">(optional)</span>
          </span>
          <input
            type="text"
            value={winningWord}
            onChange={(e) => setWinningWord(e.target.value)}
            placeholder='e.g. "Eiffel Tower"'
            data-testid="pictionary-winning-word"
            className="w-full h-11 px-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          />
        </label>

        <div className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium text-gray-700">
            Winning word picture{' '}
            <span className="text-gray-400">(optional)</span>
          </span>
          {imagePreviewUrl ? (
            <div className="relative">
              <img
                src={imagePreviewUrl}
                alt="Winning word"
                data-testid="pictionary-winning-word-image-preview"
                className="w-full max-h-64 object-contain rounded-lg border border-gray-300 bg-gray-50"
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                data-testid="pictionary-winning-word-image-remove"
                className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                title="Remove picture"
                aria-label="Remove winning word picture"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-accent-terracotta transition-colors">
              <Upload className="w-6 h-6 text-gray-400 mb-1" />
              <span className="text-sm text-text-muted">
                Upload a picture of the winning word
              </span>
              <span className="text-xs text-gray-400 mt-1">
                (Optional, max 5MB)
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageChange}
                data-testid="pictionary-winning-word-image-input"
                className="hidden"
              />
            </label>
          )}
        </div>

        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium text-gray-700">
            Notes <span className="text-gray-400">(optional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            data-testid="pictionary-notes"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          />
        </label>
      </section>

      {/* Teams */}
      <section
        className="space-y-4"
        data-testid="pictionary-teams-section"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-brand-navy">Teams</h3>
          <button
            type="button"
            onClick={addTeam}
            data-testid="add-team-button"
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-accent-terracotta hover:bg-accent-terracotta/10 rounded-md"
          >
            <Plus className="w-4 h-4" />
            Add team
          </button>
        </div>

        {people.length === 0 && (
          <p className="text-sm text-text-muted bg-amber-50 border border-amber-200 rounded-md p-3">
            Add people in the People app first, then come back to record a
            game.
          </p>
        )}

        {teams.map((team, index) => (
          <div
            key={index}
            data-testid={`team-row-${index}`}
            className={`bg-surface-white rounded-2xl shadow-sm border p-4 space-y-3 ${
              team.won
                ? 'border-amber-300 ring-1 ring-amber-200'
                : 'border-gray-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                data-testid={`team-${index}-label`}
                className="flex-1 text-base font-semibold text-brand-navy"
              >
                Team {index + 1}
              </span>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="radio"
                  name="winning-team"
                  checked={team.won}
                  onChange={() => setWinner(index)}
                  data-testid={`team-${index}-winner`}
                  className="w-4 h-4 text-accent-terracotta focus:ring-accent-terracotta"
                />
                Winner
              </label>
              {teams.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeTeam(index)}
                  aria-label={`Remove team ${index + 1}`}
                  data-testid={`team-${index}-remove`}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div>
              <div className="text-xs uppercase font-medium text-text-muted mb-2">
                Players ({team.players.length})
              </div>
              <PersonSelector
                people={people}
                isSelected={(id) =>
                  team.players.includes(`people/${id}`)
                }
                onToggle={(id) => togglePlayer(index, id)}
                variant="chips"
                searchPlaceholder="Search players…"
                containerTestId={`team-${index}-players`}
                itemTestId={(id) => `team-${index}-player-${id}`}
                favoriteIds={personFavorites.favoriteIds}
              />
            </div>
          </div>
        ))}
      </section>

      {errors.length > 0 && (
        <ul
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 list-disc list-inside"
          data-testid="pictionary-form-errors"
        >
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          data-testid="pictionary-submit-button"
          className="flex-1 h-12 rounded-lg bg-accent-terracotta hover:bg-accent-terracotta-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          data-testid="pictionary-cancel-button"
          className="px-5 h-12 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
