'use client';

/**
 * HolePlay — the one-handed scoring screen.
 *
 * Design rules (you're carrying golf clubs):
 *   - Every interactive element is at least 56px tall so a thumb can hit it.
 *   - Per-player stroke steppers live in the bottom half of the screen
 *     where the thumb rests. Par sits at the top.
 *   - Prev / Next are full-width tap zones at the very bottom.
 *   - Typing never required; no select dropdowns; no keyboard.
 *
 * State is seeded from any existing hole record (if the user is
 * revisiting), otherwise par defaults to 3 and strokes default to par
 * for each player. The record is persisted on `Next` / `Finish`.
 */

import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { ScoreStepper } from './ScoreStepper';
import { computeTotalPar, computeTotals } from '../utils/scoring';
import type { Game, Hole, PlayerScore } from '../types';

interface Person {
  id: string;
  name: string;
}

interface HolePlayProps {
  game: Game;
  currentHole: number;
  existingHole?: Hole;
  /** Holes scored before the current hole — used to show running totals. */
  previousHoles?: Hole[];
  people: Person[];
  isSaving: boolean;
  onPrevious: () => void;
  onSaveAndNext: (data: { par: number; scores: PlayerScore[] }) => void;
  onSaveAndFinish: (data: { par: number; scores: PlayerScore[] }) => void;
  onExit: () => void;
}

const DEFAULT_PAR = 3;

function displayNameFor(playerPath: string, people: Person[]): string {
  const id = playerPath.replace(/^people\//, '');
  return people.find((p) => p.id === id)?.name || 'Unknown';
}

export function HolePlay({
  game,
  currentHole,
  existingHole,
  previousHoles = [],
  people,
  isSaving,
  onPrevious,
  onSaveAndNext,
  onSaveAndFinish,
  onExit,
}: HolePlayProps) {
  // Local state is seeded once on mount. The parent forces a remount
  // when `currentHole` or `existingHole.id` changes by passing a
  // matching `key`, so we don't need a syncing effect here.
  const [par, setPar] = useState<number>(existingHole?.par ?? DEFAULT_PAR);
  const [scores, setScores] = useState<Record<string, number>>(() =>
    seedScores(game.players, existingHole, existingHole?.par ?? DEFAULT_PAR),
  );

  const cumulativeTotals = useMemo(
    () => computeTotals(previousHoles, game.players),
    [previousHoles, game.players],
  );
  const cumulativePar = useMemo(
    () => computeTotalPar(previousHoles),
    [previousHoles],
  );
  const hasCumulative = previousHoles.length > 0;

  const isLast = currentHole >= game.hole_count;
  const isFirst = currentHole <= 1;

  const handleSetStrokes = (player: string, value: number) => {
    setScores((prev) => ({ ...prev, [player]: value }));
  };

  const payload = useMemo(
    () => ({
      par,
      scores: game.players.map<PlayerScore>((player) => ({
        player,
        strokes: scores[player] ?? par,
      })),
    }),
    [par, scores, game.players],
  );

  const handleNext = () => {
    if (isSaving) return;
    if (isLast) onSaveAndFinish(payload);
    else onSaveAndNext(payload);
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] max-w-xl mx-auto">
      {/* Header — compact, single line */}
      <div className="flex items-center justify-between py-3 px-1">
        <button
          type="button"
          onClick={onExit}
          className="p-2 rounded-md hover:bg-gray-100"
          aria-label="Exit game"
          data-testid="hole-exit"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900" data-testid="hole-title">
            Hole {currentHole} of {game.hole_count}
          </div>
          <HoleProgress current={currentHole} total={game.hole_count} />
        </div>
        <div className="w-9" aria-hidden /> {/* spacer */}
      </div>

      {/* Par */}
      <section className="bg-white rounded-lg shadow-md p-4 border border-gray-200 mt-2">
        <ScoreStepper
          label="Par"
          value={par}
          onChange={setPar}
          min={1}
          max={20}
          size="md"
          testId="par"
        />
      </section>

      {/* Cumulative scores through the previous hole — only shown once
          at least one hole has been recorded. Kept compact so the
          per-player steppers remain in the thumb-friendly bottom half. */}
      {hasCumulative && (
        <section
          className="bg-white rounded-lg shadow-md p-3 border border-gray-200 mt-3"
          data-testid="cumulative-scores"
        >
          <div className="flex items-center justify-between text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            <span>Total through hole {currentHole - 1}</span>
            {cumulativePar > 0 && (
              <span className="tabular-nums">Par {cumulativePar}</span>
            )}
          </div>
          <div className="space-y-1">
            {game.players.map((player) => {
              const id = player.replace(/^people\//, '');
              const total = cumulativeTotals[player] ?? 0;
              const diff = total - cumulativePar;
              return (
                <div
                  key={player}
                  className="flex items-center justify-between text-sm"
                  data-testid={`cumulative-${id}`}
                >
                  <span className="font-medium text-gray-900 truncate">
                    {displayNameFor(player, people)}
                  </span>
                  <span className="tabular-nums">
                    <span
                      className="font-semibold text-gray-900"
                      data-testid={`cumulative-${id}-total`}
                    >
                      {total}
                    </span>
                    {cumulativePar > 0 && (
                      <span className="ml-2 text-xs text-gray-500">
                        ({diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff})
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Per-player strokes — takes up the main body, thumb-accessible */}
      <section className="flex-1 mt-4 space-y-3 pb-4">
        {game.players.map((player) => {
          const name = displayNameFor(player, people);
          const id = player.replace(/^people\//, '');
          return (
            <div
              key={player}
              className="bg-white rounded-lg shadow-md p-4 border border-gray-200"
              data-testid={`player-score-${id}`}
            >
              <ScoreStepper
                label={name}
                value={scores[player] ?? par}
                onChange={(v) => handleSetStrokes(player, v)}
                min={1}
                max={30}
                size="lg"
                testId={`strokes-${id}`}
              />
            </div>
          );
        })}
      </section>

      {/* Bottom nav */}
      <div className="sticky bottom-0 bg-white/80 backdrop-blur pt-3 pb-4 -mx-4 px-4 border-t border-gray-200 flex gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={isFirst || isSaving}
          data-testid="hole-prev"
          className="flex-1 h-14 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-semibold flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" />
          Previous
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={isSaving}
          data-testid={isLast ? 'hole-finish' : 'hole-next'}
          className="flex-[2] h-14 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-semibold flex items-center justify-center gap-2 shadow-md"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving…
            </>
          ) : isLast ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Finish
            </>
          ) : (
            <>
              Next Hole
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function seedScores(
  players: string[],
  existingHole: Hole | undefined,
  fallbackPar: number,
): Record<string, number> {
  const seeded: Record<string, number> = {};
  for (const p of players) {
    const found = existingHole?.scores.find((s) => s.player === p);
    seeded[p] = found?.strokes ?? fallbackPar;
  }
  return seeded;
}

function HoleProgress({ current, total }: { current: number; total: number }) {
  // Small dots — visual only.
  return (
    <div
      className="flex gap-1 mt-1 justify-center"
      aria-label={`Progress: hole ${current} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < current ? 'bg-primary-500' : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  );
}
