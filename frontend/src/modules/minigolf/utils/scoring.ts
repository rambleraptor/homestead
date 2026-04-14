/**
 * Pure scoring utilities for minigolf. Low strokes wins; ties are
 * returned as multiple winners.
 */

import type { Hole } from '../types';

/**
 * Sum strokes per player across all holes. Players missing scores on a
 * hole are simply not counted for that hole. Players that appear in the
 * `players` list but have no scores yet still get an entry with 0.
 */
export function computeTotals(
  holes: Hole[],
  players: string[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of players) totals[p] = 0;

  for (const hole of holes) {
    for (const s of hole.scores) {
      totals[s.player] = (totals[s.player] || 0) + s.strokes;
    }
  }
  return totals;
}

/**
 * Return the player(s) with the lowest total strokes. Empty array if
 * there are no totals. Multiple entries on a tie.
 */
export function computeWinners(totals: Record<string, number>): string[] {
  const entries = Object.entries(totals);
  if (entries.length === 0) return [];
  const min = Math.min(...entries.map(([, v]) => v));
  return entries.filter(([, v]) => v === min).map(([k]) => k);
}

/** Total par across all scored holes — used for "over/under par" display. */
export function computeTotalPar(holes: Hole[]): number {
  return holes.reduce((acc, h) => acc + (h.par || 0), 0);
}
