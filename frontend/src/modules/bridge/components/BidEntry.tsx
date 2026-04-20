'use client';

/**
 * Single-direction bid input: level (1-7) + suit selector. Rendered once
 * per cardinal direction inside `HandForm`.
 */

import React from 'react';
import {
  BRIDGE_LEVELS,
  BRIDGE_SUITS,
  type BridgeDirection,
  type BridgeLevel,
  type BridgeSuit,
} from '../types';
import { DIRECTION_LABEL, SUIT_SYMBOL, SUIT_LABEL } from '../utils';

interface BidEntryProps {
  direction: BridgeDirection;
  level: BridgeLevel;
  suit: BridgeSuit;
  onLevelChange: (level: BridgeLevel) => void;
  onSuitChange: (suit: BridgeSuit) => void;
}

export function BidEntry({
  direction,
  level,
  suit,
  onLevelChange,
  onSuitChange,
}: BidEntryProps) {
  const testBase = `bid-${direction}`;
  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3"
      data-testid={testBase}
    >
      <h4 className="text-base font-semibold text-gray-900">
        {DIRECTION_LABEL[direction]}
      </h4>

      <div className="space-y-2">
        <label
          htmlFor={`${testBase}-level`}
          className="block text-xs font-medium text-gray-600"
        >
          Level
        </label>
        <div
          className="grid grid-cols-7 gap-1"
          role="radiogroup"
          aria-label={`${DIRECTION_LABEL[direction]} level`}
        >
          {BRIDGE_LEVELS.map((lvl) => {
            const active = lvl === level;
            return (
              <button
                key={lvl}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onLevelChange(lvl)}
                data-testid={`${testBase}-level-${lvl}`}
                className={`h-10 rounded-md text-sm font-semibold border transition-colors ${
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
        <label
          htmlFor={`${testBase}-suit`}
          className="block text-xs font-medium text-gray-600"
        >
          Suit
        </label>
        <select
          id={`${testBase}-suit`}
          value={suit}
          onChange={(e) => onSuitChange(e.target.value as BridgeSuit)}
          data-testid={`${testBase}-suit`}
          className="w-full h-11 px-3 border border-gray-300 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-accent-terracotta bg-white"
        >
          {BRIDGE_SUITS.map((s) => (
            <option key={s} value={s}>
              {SUIT_SYMBOL[s]} {SUIT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
