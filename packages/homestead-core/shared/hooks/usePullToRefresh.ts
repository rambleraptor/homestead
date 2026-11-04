/**
 * Pull to refresh: the phone gesture for "show me what's new".
 *
 * The app already refetches on focus and streams other people's writes over
 * the change feed, so this is a reassurance more than a necessity — but on a
 * phone it is the one gesture everyone tries when a list looks stale, and a
 * list that doesn't answer it feels broken. On release past the threshold the
 * caller's `onRefresh` runs (the shell invalidates every query) and the
 * indicator spins until it settles.
 *
 * ## Not stealing anyone else's gesture
 *
 * A pull only begins at `scrollTop === 0`: anywhere else a downward drag is a
 * scroll and is left to the browser. It must be vertical-dominant before it
 * counts, so a `SwipeRow`'s sideways drags are untouched, and a drag that
 * starts sideways is abandoned for the rest of that finger. Only once a pull
 * is underway is `touchmove` cancelled, so the list doesn't also rubber-band
 * underneath the indicator. Everything is touch events: a mouse never pulls.
 *
 * The gesture maths (`decidePull`, `pullDistance`, `isArmed`) is pure and
 * tested on its own; the hook is the thin event plumbing around it.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { haptic } from '@rambleraptor/homestead-core/shared/haptics';

/** Movement before a touch is a gesture at all, rather than a wobble. */
export const PULL_SLOP_PX = 8;
/** Travel that arms the refresh. Deliberate — a scroll overshoot shouldn't trigger it. */
export const PULL_THRESHOLD_PX = 72;
/** The indicator never travels further than this, however far the finger goes. */
export const PULL_MAX_PX = 110;
/** Past the threshold the indicator follows the finger at this fraction of its speed. */
const PULL_RESISTANCE = 0.4;

export type PullDecision = 'undecided' | 'pull' | 'abandon';

/**
 * Whether a touch that has moved `(dx, dy)` since it landed is a pull, a
 * gesture for someone else (scroll or swipe), or not yet anything.
 */
export function decidePull(input: { dx: number; dy: number; scrollTop: number }): PullDecision {
  const { dx, dy, scrollTop } = input;
  // Not at the top: every downward drag is a scroll.
  if (scrollTop > 0) return 'abandon';
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < PULL_SLOP_PX && ay < PULL_SLOP_PX) return 'undecided';
  // Sideways: a swipe row's, or nobody's — never ours.
  if (ax >= ay) return 'abandon';
  // Pushing up from the top is a scroll (or a bounce), not a pull.
  if (dy < 0) return 'abandon';
  return 'pull';
}

/** Finger travel → indicator travel: linear to the threshold, rubber-banded past it, capped. */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0;
  if (dy <= PULL_THRESHOLD_PX) return dy;
  return Math.min(PULL_MAX_PX, PULL_THRESHOLD_PX + (dy - PULL_THRESHOLD_PX) * PULL_RESISTANCE);
}

export function isArmed(pull: number): boolean {
  return pull >= PULL_THRESHOLD_PX;
}

export type PullStatus = 'idle' | 'pulling' | 'armed' | 'refreshing';

export interface PullToRefreshState {
  /** How far the indicator has travelled, in px. */
  pull: number;
  status: PullStatus;
}

const IDLE: PullToRefreshState = { pull: 0, status: 'idle' };

export interface PullToRefreshOptions {
  /** Runs on release past the threshold; the indicator spins until it settles. */
  onRefresh: () => Promise<unknown> | unknown;
  enabled?: boolean;
}

function touchPoint(event: TouchEvent): { x: number; y: number } | null {
  const touch = event.touches[0] ?? event.changedTouches[0];
  if (!touch) return null;
  return { x: touch.clientX, y: touch.clientY };
}

export function usePullToRefresh(
  target: RefObject<HTMLElement | null>,
  { onRefresh, enabled = true }: PullToRefreshOptions,
): PullToRefreshState {
  const [state, setState] = useState<PullToRefreshState>(IDLE);

  // The latest callback, without re-attaching listeners when it changes.
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  }, [onRefresh]);

  // Gesture bookkeeping lives in a ref: it changes on every touchmove and
  // none of it should cost a render until the pull is actually moving.
  const gesture = useRef<{ startX: number; startY: number; decision: PullDecision } | null>(null);
  const refreshing = useRef(false);
  const armedRef = useRef(false);

  useEffect(() => {
    const element = target.current;
    if (!enabled || !element) return;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshing.current || event.touches.length !== 1) return;
      const point = touchPoint(event);
      if (!point) return;
      gesture.current = { startX: point.x, startY: point.y, decision: 'undecided' };
      armedRef.current = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current || current.decision === 'abandon') return;
      const point = touchPoint(event);
      if (!point) return;
      const dx = point.x - current.startX;
      const dy = point.y - current.startY;

      if (current.decision === 'undecided') {
        current.decision = decidePull({ dx, dy, scrollTop: element.scrollTop });
        if (current.decision !== 'pull') return;
      }

      // Ours now: keep the scroller still underneath the indicator.
      if (event.cancelable) event.preventDefault();
      const pull = pullDistance(dy);
      const armed = isArmed(pull);
      if (armed && !armedRef.current) haptic('tap');
      armedRef.current = armed;
      setState({ pull, status: armed ? 'armed' : 'pulling' });
    };

    const settle = () => {
      refreshing.current = false;
      setState(IDLE);
    };

    const onTouchEnd = () => {
      const current = gesture.current;
      gesture.current = null;
      if (!current || current.decision !== 'pull') return;
      if (!armedRef.current) {
        setState(IDLE);
        return;
      }
      armedRef.current = false;
      refreshing.current = true;
      setState({ pull: PULL_THRESHOLD_PX, status: 'refreshing' });
      // Start the refresh now, on the release itself; the spinner holds until
      // whatever it returned settles, however it settles.
      let outcome: Promise<unknown>;
      try {
        outcome = Promise.resolve(refresh.current());
      } catch {
        outcome = Promise.resolve();
      }
      outcome.then(settle, settle);
    };

    const onTouchCancel = () => {
      gesture.current = null;
      if (!refreshing.current) setState(IDLE);
    };

    // `touchmove` is non-passive on purpose: it has to be able to cancel the
    // scroll once a pull is underway. The others never cancel anything.
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [target, enabled]);

  return state;
}
