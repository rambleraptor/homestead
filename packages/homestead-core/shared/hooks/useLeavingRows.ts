/**
 * Rows on their way out of a list.
 *
 * The data behind these lists moves optimistically: a completed todo is out
 * of the cache — and so out of the list — before its request is even sent.
 * Left alone, the row vanishes between two frames and the rows below it
 * appear at their new positions rather than arriving there. This keeps a
 * snapshot of each row asked to leave and goes on rendering it, marked
 * `exiting`, at the place it held, until its collapse has played. A row the
 * data brings back meanwhile (an undo, a failed write rolled back) simply
 * stops leaving: the live record wins over the snapshot the moment it is
 * present again.
 *
 * An exit resolves whichever way comes first: the row reports its
 * `animationend` (`release`), or a timer a little longer than the animation
 * fires — happy-dom fires no animation events, and a background tab may not
 * either, so nothing may wait on the event alone. Under reduced motion
 * nothing is held at all: the CSS has already made the collapse instant, and
 * keeping the row for the length of a timer would turn a courtesy into a
 * delay for precisely the people who opted out of it.
 *
 * The same hook also marks which rows were there at first paint, so a list
 * can cascade those in and let a row added later rise on its own.
 *
 * Mirrors the documents index's row choreography; the todos and groceries
 * lists run on it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '@rambleraptor/homestead-core/shared/hooks/useReducedMotion';

/** Gap between consecutive rows' entrances on first paint. */
export const ROW_STAGGER_MS = 22;
/** Past this many rows the cascade has been read; the rest land together. */
export const MAX_STAGGERED_ROWS = 8;
/**
 * How long `--animate-row-collapse` runs (globals.css). The fallback timer
 * below is a little longer, so a row whose `animationend` does arrive is
 * released by the event, and one whose never does is released soon after.
 */
export const ROW_EXIT_MS = 240;
const ROW_EXIT_FALLBACK_MS = ROW_EXIT_MS + 80;

/** The delay a row at `index` on first paint rises on. */
export function cascadeDelayMs(index: number): number {
  return Math.min(Math.max(index, 0), MAX_STAGGERED_ROWS) * ROW_STAGGER_MS;
}

export interface ChoreographedRow<T> {
  item: T;
  /** The row is playing its collapse; the caller renders it inert. */
  exiting: boolean;
  /** The row was in the list when it was first drawn, so it is part of the cascade. */
  firstPaint: boolean;
}

interface Ghost<T> {
  item: T;
  /**
   * The ids that followed the row when it left, nearest first. The row is
   * drawn before the first of them still in the list, which keeps it in
   * place while its neighbours leave too.
   */
  tail: string[];
}

export interface LeavingRows<T> {
  /** The live rows plus those still collapsing, each where it belongs. */
  rows: ChoreographedRow<T>[];
  /** Start a row's exit. It keeps rendering from this snapshot until released. */
  leave: (item: T) => void;
  /** The row's collapse has finished (its `animationend`): drop the snapshot. */
  release: (id: string) => void;
}

export function useLeavingRows<T extends { id: string }>(items: readonly T[]): LeavingRows<T> {
  const reducedMotion = useReducedMotion();
  const [ghosts, setGhosts] = useState<ReadonlyMap<string, Ghost<T>>>(() => new Map());
  // Captured once, when the list mounts: the rows that cascade in together.
  const [firstPaintIds] = useState(() => new Set(items.map((item) => item.id)));
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const release = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setGhosts((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const leave = useCallback(
    (item: T) => {
      if (reducedMotion) return;
      const at = items.findIndex((candidate) => candidate.id === item.id);
      const tail = at >= 0 ? items.slice(at + 1).map((candidate) => candidate.id) : [];
      const existing = timers.current.get(item.id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        item.id,
        setTimeout(() => release(item.id), ROW_EXIT_FALLBACK_MS),
      );
      setGhosts((prev) => new Map(prev).set(item.id, { item, tail }));
    },
    [items, reducedMotion, release],
  );

  // A list unmounting mid-collapse (a scope change) must not fire timers into
  // an unmounted component.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const rows = useMemo<ChoreographedRow<T>[]>(() => {
    const live = items.map((item) => ({
      item,
      exiting: false,
      firstPaint: firstPaintIds.has(item.id),
    }));
    if (ghosts.size === 0) return live;
    const present = new Set(items.map((item) => item.id));
    for (const ghost of ghosts.values()) {
      // Back in the data: the live row is drawn instead, and nothing exits.
      if (present.has(ghost.item.id)) continue;
      const after = ghost.tail
        .map((id) => live.findIndex((row) => row.item.id === id))
        .find((index) => index >= 0);
      live.splice(after ?? live.length, 0, {
        item: ghost.item,
        exiting: true,
        firstPaint: firstPaintIds.has(ghost.item.id),
      });
    }
    return live;
  }, [items, ghosts, firstPaintIds]);

  return { rows, leave, release };
}
