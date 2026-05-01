'use client';

import type { TodoProgress } from '../types';

interface TodoProgressBarProps {
  progress: TodoProgress;
}

/**
 * Two-segment progress bar: green for completed, yellow for in-progress.
 * Track structure mirrors `CoverageProgressBar` for visual consistency.
 */
export function TodoProgressBar({ progress }: TodoProgressBarProps) {
  const greenPct = Math.max(0, Math.min(100, progress.green));
  const yellowPct = Math.max(0, Math.min(100 - greenPct, progress.yellow));

  return (
    <div
      className="flex bg-gray-100 rounded-full h-3 overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(greenPct)}
      data-testid="todos-progress"
    >
      <div
        className="h-full bg-green-500 transition-all"
        style={{ width: `${greenPct}%` }}
        data-testid="todos-progress-green"
      />
      <div
        className="h-full bg-yellow-400 transition-all"
        style={{ width: `${yellowPct}%` }}
        data-testid="todos-progress-yellow"
      />
    </div>
  );
}
