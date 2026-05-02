'use client';

/**
 * Big stepper control for minigolf score entry.
 *
 * Sized for one-handed, thumb-only interaction — minimum 56px touch
 * targets, numeric display is large and centered. Use `size="lg"` for
 * the primary per-player score steppers; `size="md"` for the par
 * stepper at the top of the hole screen.
 */

import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface ScoreStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
  size?: 'md' | 'lg';
  /** Suffix for data-testid; buttons become `${testId}-dec` / `-inc`. */
  testId?: string;
  disabled?: boolean;
}

export function ScoreStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  size = 'lg',
  testId,
  disabled = false,
}: ScoreStepperProps) {
  const buttonSize = size === 'lg' ? 'h-16 w-16' : 'h-14 w-14';
  const iconSize = size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  const valueTextSize = size === 'lg' ? 'text-4xl' : 'text-3xl';

  const canDec = !disabled && value > min;
  const canInc = !disabled && value < max;

  const handleDec = () => {
    if (canDec) onChange(value - 1);
  };
  const handleInc = () => {
    if (canInc) onChange(value + 1);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      {label && (
        <span className="text-lg font-medium text-gray-700 flex-1 truncate">
          {label}
        </span>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleDec}
          disabled={!canDec}
          aria-label={label ? `Decrease ${label}` : 'Decrease'}
          data-testid={testId ? `${testId}-dec` : undefined}
          className={`${buttonSize} flex items-center justify-center rounded-full bg-gray-200 text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed active:bg-gray-300 shadow-md transition-colors`}
        >
          <Minus className={iconSize} />
        </button>
        <div
          className={`${valueTextSize} font-bold text-gray-900 tabular-nums min-w-[3ch] text-center`}
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={handleInc}
          disabled={!canInc}
          aria-label={label ? `Increase ${label}` : 'Increase'}
          data-testid={testId ? `${testId}-inc` : undefined}
          className={`${buttonSize} flex items-center justify-center rounded-full bg-accent-terracotta text-white disabled:opacity-40 disabled:cursor-not-allowed active:bg-accent-terracotta-hover shadow-md transition-colors`}
        >
          <Plus className={iconSize} />
        </button>
      </div>
    </div>
  );
}
