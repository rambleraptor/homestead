'use client';

/**
 * A single saved hand rendered as a compact 4-row table (N/E/S/W), one
 * row per direction with its final bid.
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Hand } from '../types';
import { bidsFromHand } from '../types';
import { DIRECTION_SHORT, DIRECTION_LABEL, formatBid } from '../utils';

interface HandCardProps {
  hand: Hand;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
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

      <table className="w-full text-sm">
        <tbody>
          {bids.map((b) => (
            <tr
              key={b.direction}
              data-testid={`hand-${hand.id}-${b.direction}`}
              className="border-b border-gray-100 last:border-0"
            >
              <th
                scope="row"
                className="text-left font-medium text-gray-600 py-1.5 pr-3 w-16"
              >
                <span aria-hidden="true">{DIRECTION_SHORT[b.direction]}</span>
                <span className="sr-only">{DIRECTION_LABEL[b.direction]}</span>
              </th>
              <td
                className="py-1.5 font-semibold text-gray-900"
                data-testid={`hand-${hand.id}-${b.direction}-bid`}
              >
                {formatBid(b.level, b.suit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
