import { describe, it, expect } from 'vitest';
import { computeTotals, computeWinners, computeTotalPar } from '../utils/scoring';
import type { Hole } from '../types';

function hole(partial: Partial<Hole>): Hole {
  return {
    id: partial.id || 'h',
    path: partial.path || 'games/g/holes/h',
    hole_number: partial.hole_number ?? 1,
    par: partial.par ?? 3,
    scores: partial.scores ?? [],
    create_time: '2026-01-01T00:00:00Z',
    update_time: '2026-01-01T00:00:00Z',
  };
}

describe('computeTotals', () => {
  it('sums strokes per player across holes', () => {
    const holes = [
      hole({
        scores: [
          { player: 'people/a', strokes: 3 },
          { player: 'people/b', strokes: 5 },
        ],
      }),
      hole({
        hole_number: 2,
        scores: [
          { player: 'people/a', strokes: 4 },
          { player: 'people/b', strokes: 2 },
        ],
      }),
    ];

    expect(computeTotals(holes, ['people/a', 'people/b'])).toEqual({
      'people/a': 7,
      'people/b': 7,
    });
  });

  it('returns zero for players with no recorded scores', () => {
    expect(computeTotals([], ['people/a', 'people/b'])).toEqual({
      'people/a': 0,
      'people/b': 0,
    });
  });
});

describe('computeWinners', () => {
  it('returns the single lowest scorer', () => {
    expect(
      computeWinners({ 'people/a': 20, 'people/b': 18, 'people/c': 25 }),
    ).toEqual(['people/b']);
  });

  it('returns all tied players on an exact tie', () => {
    expect(
      computeWinners({ 'people/a': 18, 'people/b': 18, 'people/c': 25 }),
    ).toEqual(['people/a', 'people/b']);
  });

  it('returns [] when there are no totals', () => {
    expect(computeWinners({})).toEqual([]);
  });
});

describe('computeTotalPar', () => {
  it('sums par across scored holes', () => {
    expect(
      computeTotalPar([
        hole({ par: 3 }),
        hole({ hole_number: 2, par: 4 }),
        hole({ hole_number: 3, par: 2 }),
      ]),
    ).toBe(9);
  });
});
