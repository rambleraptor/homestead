'use client';

/**
 * Quick-entry hand form. Three button rows at the top: level (1-7), suit
 * (clubs/diamonds/hearts/spades/no-trump/pass), and direction (N/E/S/W).
 *
 * Flow: pick a level + suit (or just pass), then tap a direction to commit
 * that bid. Level and suit clear between directions so every direction is
 * entered fresh. Direction buttons disable once used. When the fourth
 * direction is tapped all four bids are submitted and the form resets.
 */

import React, { useState } from 'react';
import type {
  BridgeDirection,
  BridgeLevel,
  BridgeSuit,
  HandFormData,
} from '../types';
import {
  BRIDGE_DIRECTIONS,
  BRIDGE_LEVELS,
  BRIDGE_SUITS,
} from '../types';
import { DIRECTION_SHORT, SUIT_SYMBOL, SUIT_LABEL, formatBid } from '../utils';

interface HandFormProps {
  onSubmit: (data: HandFormData) => void;
  isSubmitting?: boolean;
}

interface DirBid {
  level?: BridgeLevel;
  suit: BridgeSuit;
}

const DIRECTION_ORDER: BridgeDirection[] = ['north', 'east', 'south', 'west'];

function toFormData(entered: Record<BridgeDirection, DirBid>): HandFormData {
  return {
    north_level: entered.north.level,
    north_suit: entered.north.suit,
    east_level: entered.east.level,
    east_suit: entered.east.suit,
    south_level: entered.south.level,
    south_suit: entered.south.suit,
    west_level: entered.west.level,
    west_suit: entered.west.suit,
  };
}

export function HandForm({ onSubmit, isSubmitting }: HandFormProps) {
  const [level, setLevel] = useState<BridgeLevel | null>(null);
  const [suit, setSuit] = useState<BridgeSuit | null>(null);
  const [entered, setEntered] = useState<Partial<Record<BridgeDirection, DirBid>>>({});

  const canCommit = suit === 'pass' || (level !== null && suit !== null);

  const handleDirection = (dir: BridgeDirection) => {
    if (entered[dir] || isSubmitting || !canCommit) return;
    const bid: DirBid =
      suit === 'pass' ? { suit: 'pass' } : { level: level!, suit: suit! };
    const next = { ...entered, [dir]: bid };
    const complete = BRIDGE_DIRECTIONS.every((d) => next[d]);
    if (complete) {
      onSubmit(toFormData(next as Record<BridgeDirection, DirBid>));
      setEntered({});
      setLevel(null);
      setSuit(null);
      return;
    }
    setEntered(next);
    setLevel(null);
    setSuit(null);
  };

  return (
    <section
      data-testid="hand-form"
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4"
    >
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-600">Level</div>
        <div
          role="radiogroup"
          aria-label="Level"
          className="grid grid-cols-7 gap-1"
        >
          {BRIDGE_LEVELS.map((lvl) => {
            const active = lvl === level;
            return (
              <button
                key={lvl}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLevel(lvl)}
                data-testid={`level-${lvl}`}
                className={`h-12 rounded-md text-base font-semibold border transition-colors ${
                  active
                    ? 'bg-accent-terracotta border-accent-terracotta text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-600">Suit</div>
        <div
          role="radiogroup"
          aria-label="Suit"
          className="grid grid-cols-6 gap-1"
        >
          {BRIDGE_SUITS.map((s) => {
            const active = s === suit;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={SUIT_LABEL[s]}
                onClick={() => setSuit(s)}
                data-testid={`suit-${s}`}
                className={`h-12 rounded-md ${
                  s === 'pass' ? 'text-sm' : 'text-lg'
                } font-semibold border transition-colors ${
                  active
                    ? 'bg-accent-terracotta border-accent-terracotta text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {SUIT_SYMBOL[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-600">Direction</div>
        <div className="grid grid-cols-4 gap-1">
          {DIRECTION_ORDER.map((dir) => {
            const bid = entered[dir];
            const done = Boolean(bid);
            const disabled = done || isSubmitting || !canCommit;
            return (
              <button
                key={dir}
                type="button"
                disabled={disabled}
                onClick={() => handleDirection(dir)}
                data-testid={`direction-${dir}`}
                className={`h-14 rounded-md text-base font-semibold border transition-colors flex flex-col items-center justify-center gap-0.5 ${
                  done
                    ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-accent-terracotta border-accent-terracotta text-white hover:bg-accent-terracotta-hover disabled:opacity-40'
                }`}
              >
                <span>{DIRECTION_SHORT[dir]}</span>
                {bid && (
                  <span
                    className="text-xs font-normal"
                    data-testid={`direction-${dir}-bid`}
                  >
                    {formatBid(bid.level, bid.suit)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
