/**
 * A list row that reveals an action when dragged sideways.
 *
 * The gesture every phone user already knows from Mail and Reminders: drag a
 * row aside, the action shows behind it, let go past the threshold and it
 * fires. On a list you work through one-handed — a shopping list, a todo list
 * — it removes the aim-at-a-small-target step that a row of icon buttons
 * demands.
 *
 * ## Swipe is always an accelerator, never the only route
 *
 * Every action offered here must also exist as a real button on the row.
 * Swipe is invisible, undiscoverable, and unavailable to anyone using a
 * keyboard or a screen reader — so the revealed panels are `aria-hidden` and
 * contribute nothing to the accessibility tree. Assistive tech sees the
 * buttons, which were already there. If you find yourself wanting to offer an
 * action *only* by swipe, add the button first.
 *
 * ## Not stealing the scroll
 *
 * The failure mode of a swipe list is that it fights the user's scrolling.
 * Two things prevent it here. `touch-action: pan-y` tells the browser it still
 * owns vertical panning and we only want horizontal, so scrolling stays on the
 * compositor and never waits on JavaScript. And a movement is not treated as a
 * swipe until it has travelled past a slop radius *and* is more horizontal
 * than vertical — before that it is nobody's gesture, and a mostly-vertical
 * drag is abandoned outright rather than competing.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { haptic } from '@rambleraptor/homestead-core/shared/haptics';

export interface SwipeAction {
  /** Shown on the revealed panel, and used as the action's accessible name. */
  label: string;
  icon: LucideIcon;
  /** Background + text classes for the revealed panel, e.g. `bg-green-500 text-white`. */
  className: string;
  onAction: () => void;
}

/**
 * Movement, in px, before a drag counts as a swipe rather than a stray finger
 * wobble or the start of a scroll.
 */
const SLOP_PX = 8;

/** Travel required to commit. Roughly a thumb's width — deliberate, not twitchy. */
const COMMIT_PX = 72;

/**
 * Past this the row keeps moving at a fraction of the finger's speed. Rubber
 * banding signals "this is as far as it goes" without a hard stop, which
 * otherwise reads as the gesture having broken.
 */
const RESISTANCE_AFTER_PX = 96;
const RESISTANCE_FACTOR = 0.25;

function applyResistance(dx: number): number {
  const sign = Math.sign(dx);
  const magnitude = Math.abs(dx);
  if (magnitude <= RESISTANCE_AFTER_PX) return dx;
  return sign * (RESISTANCE_AFTER_PX + (magnitude - RESISTANCE_AFTER_PX) * RESISTANCE_FACTOR);
}

export interface SwipeRowProps {
  /** Fired by dragging right; its panel is revealed at the left edge. */
  swipeRight?: SwipeAction;
  /** Fired by dragging left; its panel is revealed at the right edge. */
  swipeLeft?: SwipeAction;
  children: ReactNode;
  /** Applied to the moving foreground, so the row keeps its own background. */
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

export function SwipeRow({
  swipeRight,
  swipeLeft,
  children,
  className,
  disabled = false,
  'data-testid': testId,
}: SwipeRowProps) {
  const [dx, setDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Gesture bookkeeping lives in a ref, not state: it changes on every
  // pointermove and none of it should cost a render.
  const gesture = useRef<{
    startX: number;
    startY: number;
    locked: boolean;
    abandoned: boolean;
    pointerId: number;
  } | null>(null);

  // Set when a swipe actually happened, so the click the browser synthesises
  // afterwards doesn't also activate whatever sits under the finger.
  const suppressClick = useRef(false);

  const reset = useCallback(() => {
    gesture.current = null;
    setIsDragging(false);
    setDx(0);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || (!swipeLeft && !swipeRight)) return;
      // Secondary mouse buttons are for context menus, not gestures.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        locked: false,
        abandoned: false,
        pointerId: event.pointerId,
      };
    },
    [disabled, swipeLeft, swipeRight],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = gesture.current;
      if (!state || state.abandoned || event.pointerId !== state.pointerId) return;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;

      if (!state.locked) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (absX < SLOP_PX && absY < SLOP_PX) return;
        if (absY >= absX) {
          // They are scrolling. Bow out for the rest of this pointer so we
          // don't grab the row halfway down a flick.
          state.abandoned = true;
          return;
        }
        state.locked = true;
        setIsDragging(true);
        // Keeps the gesture alive if the finger leaves the row vertically
        // mid-swipe. Absent in some test environments, hence the guard.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }

      // Don't let a row drag toward an action it doesn't offer.
      const allowed =
        (deltaX > 0 && swipeRight) || (deltaX < 0 && swipeLeft) ? deltaX : 0;
      setDx(applyResistance(allowed));
    },
    [swipeLeft, swipeRight],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = gesture.current;
      if (!state || event.pointerId !== state.pointerId) return;

      if (state.locked) {
        suppressClick.current = true;
        const action = dx > 0 ? swipeRight : swipeLeft;
        if (Math.abs(dx) >= COMMIT_PX && action) {
          // A pulse the thumb feels as it lets go: the swipe took. Fire before
          // the row springs back. In practice the row is about to change or
          // disappear, so the return journey is rarely seen.
          haptic('tap');
          action.onAction();
        }
      }
      reset();
    },
    [dx, reset, swipeLeft, swipeRight],
  );

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const revealed = dx > 0 ? swipeRight : dx < 0 ? swipeLeft : undefined;
  const isCommitted = Math.abs(dx) >= COMMIT_PX;

  return (
    <div
      className="relative overflow-hidden"
      data-testid={testId}
      data-swipe-committed={isCommitted || undefined}
    >
      {/*
        The panel behind the row. Rendered only for the direction currently
        being dragged, and hidden from assistive tech — the equivalent button
        on the row is the accessible affordance.
      */}
      {revealed && (
        <div
          className={cn(
            'absolute inset-y-0 flex items-center gap-2 px-4 font-body text-sm font-medium',
            dx > 0 ? 'left-0' : 'right-0',
            revealed.className,
          )}
          aria-hidden="true"
        >
          <revealed.icon
            className={cn(
              'h-5 w-5 transition-transform duration-(--duration-quick) ease-out-soft',
              // A nudge in scale at the commit point: the row tells you it
              // will fire before you let go, so releasing is a decision rather
              // than a gamble.
              isCommitted ? 'scale-110' : 'scale-90',
            )}
          />
          <span>{revealed.label}</span>
        </div>
      )}

      <div
        className={cn('relative touch-pan-y', className)}
        style={{
          transform: `translate3d(${dx}px, 0, 0)`,
          // Follow the finger exactly while dragging; ease only on the way
          // back, where there is no finger to keep up with.
          transition: isDragging
            ? undefined
            : 'transform var(--duration-settle) var(--ease-out-soft)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
