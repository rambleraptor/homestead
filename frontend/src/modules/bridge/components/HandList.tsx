'use client';

/**
 * All saved hands rendered one-per-card so every direction's bid is
 * visible at a glance on a single page. Empty state points to the
 * `New Hand` button.
 */

import React from 'react';
import { Club } from 'lucide-react';
import type { Hand } from '../types';
import { HandCard } from './HandCard';

interface HandListProps {
  hands: Hand[];
  onDelete?: (id: string) => void;
  deletingId?: string | null;
}

export function HandList({ hands, onDelete, deletingId }: HandListProps) {
  if (hands.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 border border-gray-200 text-center">
        <Club className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600">
          No hands yet. Tap <strong>New Hand</strong> to record one.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
      data-testid="hand-list"
    >
      {hands.map((hand) => (
        <HandCard
          key={hand.id}
          hand={hand}
          onDelete={onDelete}
          isDeleting={deletingId === hand.id}
        />
      ))}
    </div>
  );
}
