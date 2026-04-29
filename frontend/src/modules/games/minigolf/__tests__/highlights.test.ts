import { describe, it, expect } from 'vitest';
import { computeHighlights } from '../utils/highlights';
import type { Hole, PlayerScore } from '../types';

function hole(
  holeNumber: number,
  par: number,
  scores: PlayerScore[],
): Hole {
  return {
    id: `h${holeNumber}`,
    path: `games/g/holes/h${holeNumber}`,
    hole_number: holeNumber,
    par,
    scores,
    create_time: '2026-01-01T00:00:00Z',
    update_time: '2026-01-01T00:00:00Z',
  };
}

describe('computeHighlights', () => {
  it('returns one highlight per player in the same order', () => {
    const players = ['people/a', 'people/b', 'people/c'];
    const holes = [
      hole(1, 3, [
        { player: 'people/a', strokes: 1 },
        { player: 'people/b', strokes: 3 },
        { player: 'people/c', strokes: 5 },
      ]),
      hole(2, 3, [
        { player: 'people/a', strokes: 2 },
        { player: 'people/b', strokes: 3 },
        { player: 'people/c', strokes: 4 },
      ]),
      hole(3, 4, [
        { player: 'people/a', strokes: 3 },
        { player: 'people/b', strokes: 4 },
        { player: 'people/c', strokes: 6 },
      ]),
      hole(4, 4, [
        { player: 'people/a', strokes: 5 },
        { player: 'people/b', strokes: 4 },
        { player: 'people/c', strokes: 5 },
      ]),
    ];

    const highlights = computeHighlights(holes, players);

    expect(highlights).toHaveLength(3);
    expect(highlights.map((h) => h.player)).toEqual(players);

    // Highlights are unique per player.
    const titles = highlights.map((h) => h.title);
    expect(new Set(titles).size).toBe(titles.length);

    // Every highlight has a non-empty short description.
    for (const h of highlights) {
      expect(h.description.length).toBeGreaterThan(0);
      expect(h.title.length).toBeGreaterThan(0);
    }
  });

  it('awards Ace Master to the player with the most hole-in-ones', () => {
    const players = ['people/a', 'people/b'];
    const holes = [
      hole(1, 3, [
        { player: 'people/a', strokes: 1 },
        { player: 'people/b', strokes: 3 },
      ]),
      hole(2, 3, [
        { player: 'people/a', strokes: 1 },
        { player: 'people/b', strokes: 1 },
      ]),
      hole(3, 4, [
        { player: 'people/a', strokes: 4 },
        { player: 'people/b', strokes: 4 },
      ]),
    ];

    const result = computeHighlights(holes, players);
    const a = result.find((h) => h.player === 'people/a')!;
    expect(a.title).toBe('Ace Master');
    expect(a.description).toMatch(/2 hole-in-ones/);
  });

  it('skips the Ace Master highlight when nobody got a hole-in-one', () => {
    const players = ['people/a', 'people/b'];
    const holes = [
      hole(1, 3, [
        { player: 'people/a', strokes: 3 },
        { player: 'people/b', strokes: 4 },
      ]),
      hole(2, 4, [
        { player: 'people/a', strokes: 4 },
        { player: 'people/b', strokes: 5 },
      ]),
    ];

    const result = computeHighlights(holes, players);
    expect(result.map((h) => h.title)).not.toContain('Ace Master');
  });

  it('finds the most consistent player by stroke std-dev', () => {
    // Par left unset (0) so par-based highlights don't apply, leaving
    // consistency as the top scoring category for `steady` once `wild`
    // claims Ace Master with their hole-in-ones.
    const players = ['steady', 'wild'];
    const holes = [
      hole(1, 0, [
        { player: 'steady', strokes: 3 },
        { player: 'wild', strokes: 1 },
      ]),
      hole(2, 0, [
        { player: 'steady', strokes: 3 },
        { player: 'wild', strokes: 1 },
      ]),
      hole(3, 0, [
        { player: 'steady', strokes: 3 },
        { player: 'wild', strokes: 1 },
      ]),
      hole(4, 0, [
        { player: 'steady', strokes: 3 },
        { player: 'wild', strokes: 1 },
      ]),
    ];

    const result = computeHighlights(holes, players);
    const steady = result.find((h) => h.player === 'steady')!;
    expect(steady.title).toBe('Steady Eddie');
  });

  it('produces a fallback highlight when a player has no scores', () => {
    const players = ['people/a', 'people/b'];
    const holes = [
      hole(1, 3, [{ player: 'people/a', strokes: 3 }]),
    ];

    const result = computeHighlights(holes, players);
    const b = result.find((h) => h.player === 'people/b')!;
    expect(b.title.length).toBeGreaterThan(0);
    expect(b.description.length).toBeGreaterThan(0);
  });

  it('returns an empty list when there are no players', () => {
    expect(computeHighlights([], [])).toEqual([]);
  });
});
