/**
 * Per-player highlights for a finished game.
 *
 * Computes one short, distinct highlight per player from a pool of
 * candidate categories (most hole-in-ones, most consistent, closest to
 * par, etc.). Categories are tried in priority order; once a player has
 * been awarded a highlight they are skipped for later categories so each
 * player gets a different superlative. A fallback ensures every player
 * receives something even when the data is sparse.
 */

import type { Hole } from '../types';

export interface PlayerHighlight {
  player: string;
  title: string;
  description: string;
}

interface HoleScore {
  holeNumber: number;
  strokes: number;
  par: number;
}

interface PlayerStats {
  player: string;
  scoredHoles: HoleScore[];
  holeInOnes: number;
  parCount: number;
  birdies: number;
  bogeys: number;
  totalStrokes: number;
  totalPar: number;
  diffFromPar: number;
  avgStrokes: number;
  stdDev: number;
  bestHole: HoleScore | null;
  worstHole: HoleScore | null;
  bestUnderPar: number;
  firstHalfAvg: number | null;
  secondHalfAvg: number | null;
  improvement: number;
  holesWonOutright: number;
}

function computePlayerStats(player: string, holes: Hole[]): PlayerStats {
  const sorted = [...holes].sort((a, b) => a.hole_number - b.hole_number);
  const scoredHoles: HoleScore[] = [];
  for (const h of sorted) {
    const entry = h.scores.find((s) => s.player === player);
    if (entry) {
      scoredHoles.push({
        holeNumber: h.hole_number,
        strokes: entry.strokes,
        par: h.par,
      });
    }
  }

  const totalStrokes = scoredHoles.reduce((a, b) => a + b.strokes, 0);
  const totalPar = scoredHoles.reduce((a, b) => a + b.par, 0);
  const avgStrokes =
    scoredHoles.length > 0 ? totalStrokes / scoredHoles.length : 0;

  const variance =
    scoredHoles.length > 1
      ? scoredHoles.reduce(
          (acc, b) => acc + (b.strokes - avgStrokes) ** 2,
          0,
        ) / scoredHoles.length
      : 0;
  const stdDev = Math.sqrt(variance);

  let bestHole: HoleScore | null = null;
  let worstHole: HoleScore | null = null;
  let bestUnderPar = 0;
  for (const b of scoredHoles) {
    if (!bestHole || b.strokes < bestHole.strokes) bestHole = b;
    if (!worstHole || b.strokes > worstHole.strokes) worstHole = b;
    if (b.par > 0) {
      const under = b.par - b.strokes;
      if (under > bestUnderPar) bestUnderPar = under;
    }
  }

  const half = Math.floor(scoredHoles.length / 2);
  const firstHalf = scoredHoles.slice(0, half);
  const secondHalf = scoredHoles.slice(scoredHoles.length - half);
  const firstHalfAvg =
    firstHalf.length > 0
      ? firstHalf.reduce((a, b) => a + b.strokes, 0) / firstHalf.length
      : null;
  const secondHalfAvg =
    secondHalf.length > 0
      ? secondHalf.reduce((a, b) => a + b.strokes, 0) / secondHalf.length
      : null;
  const improvement =
    firstHalfAvg !== null && secondHalfAvg !== null
      ? firstHalfAvg - secondHalfAvg
      : 0;

  // Holes won outright = strictly lowest score on a hole where at least
  // one other player also has a recorded score.
  let holesWonOutright = 0;
  for (const h of sorted) {
    const ours = h.scores.find((s) => s.player === player)?.strokes;
    if (ours === undefined) continue;
    const others = h.scores.filter((s) => s.player !== player);
    if (others.length === 0) continue;
    const minOther = Math.min(...others.map((s) => s.strokes));
    if (ours < minOther) holesWonOutright++;
  }

  // Holes that count toward par totals only — used in description text.
  const holesWithPar = scoredHoles.filter((b) => b.par > 0);
  const birdies = holesWithPar.filter((b) => b.strokes < b.par).length;
  const bogeys = holesWithPar.filter((b) => b.strokes > b.par).length;
  const parCount = holesWithPar.filter((b) => b.strokes === b.par).length;
  const holeInOnes = scoredHoles.filter((b) => b.strokes === 1).length;

  return {
    player,
    scoredHoles,
    holeInOnes,
    parCount,
    birdies,
    bogeys,
    totalStrokes,
    totalPar,
    diffFromPar: totalStrokes - totalPar,
    avgStrokes,
    stdDev,
    bestHole,
    worstHole,
    bestUnderPar,
    firstHalfAvg,
    secondHalfAvg,
    improvement,
    holesWonOutright,
  };
}

interface CandidateResult {
  player: string;
  description: string;
}

interface HighlightCandidate {
  title: string;
  select: (pool: PlayerStats[], all: PlayerStats[]) => CandidateResult | null;
}

function pickMaxBy<T>(
  items: T[],
  score: (item: T) => number,
  minScore = -Infinity,
): T | null {
  if (items.length === 0) return null;
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  if (best === null || bestScore <= minScore) return null;
  return best;
}

function pickMinBy<T>(
  items: T[],
  score: (item: T) => number,
): T | null {
  if (items.length === 0) return null;
  let best: T | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    const s = score(item);
    if (s < bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

function fmtAvg(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

function diffLabel(diff: number): string {
  if (diff === 0) return 'right on par';
  if (diff > 0) return `${diff} over par`;
  return `${Math.abs(diff)} under par`;
}

const CANDIDATES: HighlightCandidate[] = [
  {
    title: 'Ace Master',
    select: (pool) => {
      const top = pickMaxBy(pool, (s) => s.holeInOnes, 0);
      if (!top) return null;
      return {
        player: top.player,
        description:
          top.holeInOnes === 1
            ? 'Sank a hole-in-one.'
            : `Sank ${top.holeInOnes} hole-in-ones.`,
      };
    },
  },
  {
    title: 'Hole Crusher',
    select: (pool) => {
      const top = pickMaxBy(pool, (s) => s.holesWonOutright, 0);
      if (!top) return null;
      return {
        player: top.player,
        description:
          top.holesWonOutright === 1
            ? 'Took the lowest score on 1 hole.'
            : `Took the lowest score on ${top.holesWonOutright} holes.`,
      };
    },
  },
  {
    title: 'Birdie Machine',
    select: (pool) => {
      const top = pickMaxBy(pool, (s) => s.birdies, 0);
      if (!top) return null;
      return {
        player: top.player,
        description:
          top.birdies === 1
            ? 'Carded 1 hole under par.'
            : `Carded ${top.birdies} holes under par.`,
      };
    },
  },
  {
    title: 'Signature Shot',
    select: (pool) => {
      const top = pickMaxBy(pool, (s) => s.bestUnderPar, 1);
      if (!top || !top.bestHole) return null;
      const under = top.bestUnderPar;
      return {
        player: top.player,
        description: `Went ${under} under par on hole ${top.bestHole.holeNumber}.`,
      };
    },
  },
  {
    title: 'Par Master',
    select: (pool) => {
      const top = pickMaxBy(pool, (s) => s.parCount, 0);
      if (!top) return null;
      return {
        player: top.player,
        description:
          top.parCount === 1
            ? 'Hit par on 1 hole.'
            : `Hit par on ${top.parCount} holes.`,
      };
    },
  },
  {
    title: 'Closest to Par',
    select: (pool) => {
      const eligible = pool.filter((s) => s.totalPar > 0);
      const top = pickMinBy(eligible, (s) => Math.abs(s.diffFromPar));
      if (!top) return null;
      return {
        player: top.player,
        description: `Finished ${diffLabel(top.diffFromPar)} for the round.`,
      };
    },
  },
  {
    title: 'Steady Eddie',
    select: (pool) => {
      const eligible = pool.filter((s) => s.scoredHoles.length >= 2);
      const top = pickMinBy(eligible, (s) => s.stdDev);
      if (!top) return null;
      return {
        player: top.player,
        description: `Most consistent — averaged ${fmtAvg(top.avgStrokes)} strokes per hole.`,
      };
    },
  },
  {
    title: 'Strong Finisher',
    select: (pool) => {
      const eligible = pool.filter(
        (s) =>
          s.firstHalfAvg !== null &&
          s.secondHalfAvg !== null &&
          s.improvement > 0,
      );
      const top = pickMaxBy(eligible, (s) => s.improvement, 0);
      if (!top) return null;
      return {
        player: top.player,
        description: `Dropped from ${fmtAvg(top.firstHalfAvg!)} to ${fmtAvg(top.secondHalfAvg!)} strokes per hole down the back stretch.`,
      };
    },
  },
  {
    title: 'Quick Starter',
    select: (pool) => {
      const eligible = pool.filter((s) => s.firstHalfAvg !== null);
      const top = pickMinBy(eligible, (s) => s.firstHalfAvg!);
      if (!top) return null;
      return {
        player: top.player,
        description: `Came out hot, averaging ${fmtAvg(top.firstHalfAvg!)} strokes on the front holes.`,
      };
    },
  },
  {
    title: 'Nerves of Steel',
    select: (pool) => {
      const eligible = pool.filter((s) => s.worstHole !== null);
      const top = pickMinBy(eligible, (s) => s.worstHole!.strokes);
      if (!top || !top.worstHole) return null;
      return {
        player: top.player,
        description: `Never carded worse than ${top.worstHole.strokes} on a single hole.`,
      };
    },
  },
  {
    title: 'On Form',
    select: (pool) => {
      const eligible = pool.filter((s) => s.scoredHoles.length > 0);
      const top = pickMinBy(eligible, (s) => s.avgStrokes);
      if (!top) return null;
      return {
        player: top.player,
        description: `Lowest stroke average of the day at ${fmtAvg(top.avgStrokes)} per hole.`,
      };
    },
  },
];

function fallbackHighlight(stats: PlayerStats): PlayerHighlight {
  if (stats.scoredHoles.length === 0) {
    return {
      player: stats.player,
      title: 'Showed Up',
      description: 'Joined the round.',
    };
  }
  if (stats.totalPar > 0) {
    return {
      player: stats.player,
      title: 'Solid Round',
      description: `Finished ${diffLabel(stats.diffFromPar)} across ${stats.scoredHoles.length} holes.`,
    };
  }
  return {
    player: stats.player,
    title: 'Solid Round',
    description: `Played ${stats.scoredHoles.length} holes for ${stats.totalStrokes} strokes total.`,
  };
}

export function computeHighlights(
  holes: Hole[],
  players: string[],
): PlayerHighlight[] {
  const stats = players.map((p) => computePlayerStats(p, holes));
  const assigned = new Map<string, PlayerHighlight>();

  for (const candidate of CANDIDATES) {
    if (assigned.size >= players.length) break;
    const pool = stats.filter((s) => !assigned.has(s.player));
    const picked = candidate.select(pool, stats);
    if (picked) {
      assigned.set(picked.player, {
        player: picked.player,
        title: candidate.title,
        description: picked.description,
      });
    }
  }

  for (const s of stats) {
    if (!assigned.has(s.player)) {
      assigned.set(s.player, fallbackHighlight(s));
    }
  }

  return players.map((p) => assigned.get(p)!).filter(Boolean);
}
