import { describe, it, expect } from 'vitest';
import { bidsFromHand, type Hand } from '../types';

function makeHand(): Hand {
  return {
    id: 'h1',
    path: 'hands/h1',
    create_time: '2026-04-20T00:00:00Z',
    update_time: '2026-04-20T00:00:00Z',
    north_level: 3,
    north_suit: 'spades',
    south_level: 4,
    south_suit: 'hearts',
    east_level: 2,
    east_suit: 'no-trump',
    west_level: 1,
    west_suit: 'clubs',
  };
}

describe('bidsFromHand', () => {
  it('emits one bid per direction with paired level + suit', () => {
    const bids = bidsFromHand(makeHand());
    expect(bids).toHaveLength(4);
    expect(bids.map((b) => b.direction).sort()).toEqual([
      'east',
      'north',
      'south',
      'west',
    ]);
    const byDir = Object.fromEntries(bids.map((b) => [b.direction, b]));
    expect(byDir.north).toEqual({ direction: 'north', level: 3, suit: 'spades' });
    expect(byDir.east).toEqual({ direction: 'east', level: 2, suit: 'no-trump' });
    expect(byDir.south).toEqual({ direction: 'south', level: 4, suit: 'hearts' });
    expect(byDir.west).toEqual({ direction: 'west', level: 1, suit: 'clubs' });
  });
});
