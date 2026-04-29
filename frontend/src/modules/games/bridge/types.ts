/**
 * Bridge module types.
 *
 * A `Hand` record captures the final bid per cardinal direction in a
 * single deal of Bridge. Each direction contributes a (level, suit) pair.
 * Level is always 1-7; suit is one of the `BridgeSuit` values.
 */

export const BRIDGE_SUITS = [
  'clubs',
  'diamonds',
  'hearts',
  'spades',
  'no-trump',
  'pass',
] as const;

export type BridgeSuit = (typeof BRIDGE_SUITS)[number];

export const BRIDGE_DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export type BridgeDirection = (typeof BRIDGE_DIRECTIONS)[number];

export const BRIDGE_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
export type BridgeLevel = (typeof BRIDGE_LEVELS)[number];

/** A single direction's bid within a hand. Level is absent for a pass. */
export interface BridgeBid {
  direction: BridgeDirection;
  level?: BridgeLevel;
  suit: BridgeSuit;
}

export interface Hand {
  id: string;
  path: string;
  played_at?: string;
  north_level?: BridgeLevel;
  north_suit: BridgeSuit;
  south_level?: BridgeLevel;
  south_suit: BridgeSuit;
  east_level?: BridgeLevel;
  east_suit: BridgeSuit;
  west_level?: BridgeLevel;
  west_suit: BridgeSuit;
  notes?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

export interface HandFormData {
  played_at?: string;
  north_level?: BridgeLevel;
  north_suit: BridgeSuit;
  south_level?: BridgeLevel;
  south_suit: BridgeSuit;
  east_level?: BridgeLevel;
  east_suit: BridgeSuit;
  west_level?: BridgeLevel;
  west_suit: BridgeSuit;
  notes?: string;
}

/** Flatten a hand's stored columns into the four per-direction bids. */
export function bidsFromHand(hand: Hand): BridgeBid[] {
  return [
    { direction: 'north', level: hand.north_level, suit: hand.north_suit },
    { direction: 'east', level: hand.east_level, suit: hand.east_suit },
    { direction: 'south', level: hand.south_level, suit: hand.south_suit },
    { direction: 'west', level: hand.west_level, suit: hand.west_suit },
  ];
}
