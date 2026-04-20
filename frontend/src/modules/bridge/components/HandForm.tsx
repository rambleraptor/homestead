'use client';

/**
 * Hand entry form — captures the final bid for all four cardinal
 * directions in a single deal, plus optional notes. Rendered inline on
 * the bridge home page so new hands can be entered without navigating
 * away from the list; parent remounts the form (via `key`) to reset
 * after a successful save.
 */

import React, { useState } from 'react';
import type {
  BridgeLevel,
  BridgeSuit,
  HandFormData,
} from '../types';
import { BRIDGE_DIRECTIONS } from '../types';
import { BidEntry } from './BidEntry';

interface HandFormProps {
  onSubmit: (data: HandFormData) => void;
  isSubmitting?: boolean;
}

interface BidState {
  level: BridgeLevel;
  suit: BridgeSuit;
}

const DEFAULT_BID: BidState = { level: 1, suit: 'clubs' };

export function HandForm({ onSubmit, isSubmitting }: HandFormProps) {
  const [bids, setBids] = useState<Record<string, BidState>>({
    north: { ...DEFAULT_BID },
    east: { ...DEFAULT_BID },
    south: { ...DEFAULT_BID },
    west: { ...DEFAULT_BID },
  });
  const [notes, setNotes] = useState('');

  const updateBid = (
    direction: string,
    patch: Partial<BidState>,
  ) => {
    setBids((prev) => ({
      ...prev,
      [direction]: { ...prev[direction], ...patch },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    onSubmit({
      north_level: bids.north.level,
      north_suit: bids.north.suit,
      south_level: bids.south.level,
      south_suit: bids.south.suit,
      east_level: bids.east.level,
      east_suit: bids.east.suit,
      west_level: bids.west.level,
      west_suit: bids.west.suit,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="hand-form"
    >
      <h2 className="text-lg font-semibold text-gray-900">New Hand</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {BRIDGE_DIRECTIONS.map((direction) => (
          <BidEntry
            key={direction}
            direction={direction}
            level={bids[direction].level}
            suit={bids[direction].suit}
            onLevelChange={(level) => updateBid(direction, { level })}
            onSuitChange={(suit) => updateBid(direction, { suit })}
          />
        ))}
      </div>

      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-2">
        <label
          htmlFor="hand-notes"
          className="block text-sm font-semibold text-gray-900"
        >
          Notes <span className="text-xs font-normal text-gray-500">(optional)</span>
        </label>
        <textarea
          id="hand-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. doubled by East, slam made"
          data-testid="hand-notes"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        />
      </section>

      <button
        type="submit"
        disabled={isSubmitting}
        data-testid="save-hand-button"
        className="w-full h-14 rounded-lg bg-accent-terracotta hover:bg-accent-terracotta-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-lg shadow-md transition-colors"
      >
        {isSubmitting ? 'Saving…' : 'Save Hand'}
      </button>
    </form>
  );
}
