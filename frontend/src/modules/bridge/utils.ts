/**
 * Presentation helpers for the Bridge module — suit symbols/labels and a
 * compact bid formatter (e.g. `3♠`, `7 NT`).
 */

import type { BridgeDirection, BridgeSuit } from './types';

export const SUIT_SYMBOL: Record<BridgeSuit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
  'no-trump': 'NT',
  pass: 'Pass',
};

export const SUIT_LABEL: Record<BridgeSuit, string> = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
  'no-trump': 'No Trump',
  pass: 'Pass',
};

export const DIRECTION_LABEL: Record<BridgeDirection, string> = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
};

export const DIRECTION_SHORT: Record<BridgeDirection, string> = {
  north: 'N',
  south: 'S',
  east: 'E',
  west: 'W',
};

export function formatBid(level: number | undefined, suit: BridgeSuit): string {
  if (suit === 'pass') return 'Pass';
  const symbol = SUIT_SYMBOL[suit];
  return suit === 'no-trump' ? `${level} ${symbol}` : `${level}${symbol}`;
}
