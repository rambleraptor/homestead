import { describe, it, expect } from 'vitest';
import { formatBid, SUIT_SYMBOL, DIRECTION_SHORT } from '../utils';

describe('bridge/utils', () => {
  it('formats suited bids with the suit symbol glued to the level', () => {
    expect(formatBid(3, 'spades')).toBe('3♠');
    expect(formatBid(7, 'clubs')).toBe('7♣');
    expect(formatBid(1, 'diamonds')).toBe('1♦');
    expect(formatBid(5, 'hearts')).toBe('5♥');
  });

  it('spaces no-trump bids so "NT" reads clearly', () => {
    expect(formatBid(4, 'no-trump')).toBe('4 NT');
  });

  it('exposes short labels for each direction', () => {
    expect(DIRECTION_SHORT.north).toBe('N');
    expect(DIRECTION_SHORT.south).toBe('S');
    expect(DIRECTION_SHORT.east).toBe('E');
    expect(DIRECTION_SHORT.west).toBe('W');
  });

  it('uses NT for no-trump in the symbol map', () => {
    expect(SUIT_SYMBOL['no-trump']).toBe('NT');
  });
});
