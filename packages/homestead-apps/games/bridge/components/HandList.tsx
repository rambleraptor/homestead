/**
 * All saved hands rendered one-per-card so every direction's bid is
 * visible at a glance on a single page. Empty state points to the
 * entry form above it.
 */

import { Club } from 'lucide-react';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
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
      <EmptyState
        icon={Club}
        title="No hands yet"
        description="Pick a level, a suit and each direction above to record the first one."
        data-testid="hand-list-empty"
      />
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
