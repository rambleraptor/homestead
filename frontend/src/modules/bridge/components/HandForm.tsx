'use client';

/**
 * Hand entry form — captures the final bid for all four cardinal
 * directions in a single deal, plus optional notes. Defaults to 1♣ for
 * every direction so the form is valid as soon as it opens.
 */

import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type {
  BridgeLevel,
  BridgeSuit,
  HandFormData,
} from '../types';
import { BRIDGE_DIRECTIONS } from '../types';
import { BidEntry } from './BidEntry';

interface HandFormProps {
  onSubmit: (data: HandFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

interface BidState {
  level: BridgeLevel;
  suit: BridgeSuit;
}

const DEFAULT_BID: BidState = { level: 1, suit: 'clubs' };

export function HandForm({ onSubmit, onCancel, isSubmitting }: HandFormProps) {
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
      className="max-w-2xl mx-auto space-y-6"
      data-testid="hand-form"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="p-2 rounded-md hover:bg-gray-100"
          data-testid="hand-form-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">New Hand</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
