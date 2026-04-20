'use client';

/**
 * A single hand rendered as a 2×2 compass grid: North on top, South on
 * bottom, West left, East right. Each cell shows its direction's final
 * bid (e.g. `3♠`) so all four bids are visible on one page.
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import type { BridgeDirection, BridgeLevel, BridgeSuit, Hand } from '../types';
import { bidsFromHand } from '../types';
import { DIRECTION_LABEL, DIRECTION_SHORT, formatBid } from '../utils';

interface HandCardProps {
  hand: Hand;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

interface CompassCellProps {
  handId: string;
  direction: BridgeDirection;
  level: BridgeLevel;
  suit: BridgeSuit;
}

function CompassCell({ handId, direction, level, suit }: CompassCellProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 p-3 rounded-md bg-gray-50 border border-gray-200"
      data-testid={`hand-${handId}-${direction}`}
    >
      <span className="text-[10px] uppercase tracking-wide text-gray-500">
        {DIRECTION_SHORT[direction]}
        <span className="sr-only"> ({DIRECTION_LABEL[direction]})</span>
      </span>
      <span
        className="text-lg font-semibold text-gray-900"
        data-testid={`hand-${handId}-${direction}-bid`}
      >
        {formatBid(level, suit)}
      </span>
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function HandCard({ hand, onDelete, isDeleting }: HandCardProps) {
  const bids = bidsFromHand(hand);
  const byDir = Object.fromEntries(
    bids.map((b) => [b.direction, b]),
  ) as Record<BridgeDirection, (typeof bids)[number]>;
  const date = formatDate(hand.played_at || hand.create_time);

  return (
    <article
      className="bg-white rounded-lg shadow-md p-4 border border-gray-200 space-y-3"
      data-testid={`hand-card-${hand.id}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="text-sm text-gray-500">{date}</div>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(hand.id)}
            disabled={isDeleting}
            aria-label="Delete hand"
            data-testid={`hand-${hand.id}-delete`}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </header>

      <div className="grid grid-cols-3 gap-2">
        <div />
        <CompassCell
          handId={hand.id}
          direction="north"
          level={byDir.north.level}
          suit={byDir.north.suit}
        />
        <div />
        <CompassCell
          handId={hand.id}
          direction="west"
          level={byDir.west.level}
          suit={byDir.west.suit}
        />
        <div className="flex items-center justify-center text-xs text-gray-400">
          hand
        </div>
        <CompassCell
          handId={hand.id}
          direction="east"
          level={byDir.east.level}
          suit={byDir.east.suit}
        />
        <div />
        <CompassCell
          handId={hand.id}
          direction="south"
          level={byDir.south.level}
          suit={byDir.south.suit}
        />
        <div />
      </div>

      {hand.notes && (
        <p
          className="text-sm text-gray-700 pt-2 border-t border-gray-100"
          data-testid={`hand-${hand.id}-notes`}
        >
          {hand.notes}
        </p>
      )}
    </article>
  );
}
