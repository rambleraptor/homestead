import { describe, it, expect, beforeEach } from 'vitest';
import { clearHands, loadHands, newHandId, saveHands } from '../storage';
import type { Hand } from '../types';

const SAMPLE: Hand = {
  id: 'hand-1',
  path: 'hands/hand-1',
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

describe('bridge/storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(loadHands()).toEqual([]);
  });

  it('round-trips hands through save + load', () => {
    saveHands([SAMPLE]);
    expect(loadHands()).toEqual([SAMPLE]);
  });

  it('returns [] when the stored value is not valid JSON', () => {
    window.localStorage.setItem('bridge:hands', 'not-json');
    expect(loadHands()).toEqual([]);
  });

  it('returns [] when the stored value is JSON but not an array', () => {
    window.localStorage.setItem('bridge:hands', JSON.stringify({ wrong: true }));
    expect(loadHands()).toEqual([]);
  });

  it('clearHands removes the key', () => {
    saveHands([SAMPLE]);
    clearHands();
    expect(loadHands()).toEqual([]);
  });

  it('newHandId returns a non-empty unique-ish string', () => {
    const a = newHandId();
    const b = newHandId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
