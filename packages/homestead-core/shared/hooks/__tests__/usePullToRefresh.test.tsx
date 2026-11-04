/**
 * Tests for pull-to-refresh.
 *
 * The maths is where the gesture either coexists with scrolling and swiping
 * or fights them, so it is tested on its own; the hook tests then drive real
 * touch events through a scroller to check the plumbing: nothing before the
 * threshold, a refresh after it, and a spinner that holds until the refresh
 * settles.
 */

import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  PULL_MAX_PX,
  PULL_THRESHOLD_PX,
  decidePull,
  isArmed,
  pullDistance,
  usePullToRefresh,
} from '../usePullToRefresh';
import { PullToRefreshIndicator } from '../../components/PullToRefreshIndicator';

describe('decidePull', () => {
  it('is undecided inside the slop radius', () => {
    expect(decidePull({ dx: 3, dy: 5, scrollTop: 0 })).toBe('undecided');
  });

  it('pulls on a downward, vertical-dominant drag from the top', () => {
    expect(decidePull({ dx: 4, dy: 20, scrollTop: 0 })).toBe('pull');
  });

  it('leaves a sideways drag to the swipe rows', () => {
    expect(decidePull({ dx: 20, dy: 10, scrollTop: 0 })).toBe('abandon');
    expect(decidePull({ dx: -20, dy: 20, scrollTop: 0 })).toBe('abandon');
  });

  it('leaves an upward drag to the scroller', () => {
    expect(decidePull({ dx: 0, dy: -20, scrollTop: 0 })).toBe('abandon');
  });

  it('never starts away from the top', () => {
    expect(decidePull({ dx: 0, dy: 40, scrollTop: 1 })).toBe('abandon');
  });
});

describe('pullDistance', () => {
  it('follows the finger up to the threshold', () => {
    expect(pullDistance(-10)).toBe(0);
    expect(pullDistance(30)).toBe(30);
    expect(pullDistance(PULL_THRESHOLD_PX)).toBe(PULL_THRESHOLD_PX);
  });

  it('rubber-bands past the threshold', () => {
    const past = pullDistance(PULL_THRESHOLD_PX + 50);
    expect(past).toBeGreaterThan(PULL_THRESHOLD_PX);
    expect(past).toBeLessThan(PULL_THRESHOLD_PX + 50);
  });

  it('caps however far the finger goes', () => {
    expect(pullDistance(10_000)).toBe(PULL_MAX_PX);
  });

  it('arms at the threshold', () => {
    expect(isArmed(PULL_THRESHOLD_PX - 1)).toBe(false);
    expect(isArmed(PULL_THRESHOLD_PX)).toBe(true);
  });
});

function Harness({
  onRefresh,
  enabled,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const state = usePullToRefresh(ref, { onRefresh, enabled });
  return (
    <div ref={ref} data-testid="scroller" data-status={state.status} data-pull={state.pull}>
      <PullToRefreshIndicator {...state} />
      <p>content</p>
    </div>
  );
}

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

function drag(el: HTMLElement, { dx, dy }: { dx: number; dy: number }) {
  fireEvent.touchStart(el, touch(0, 0));
  // Two moves, like a finger: the first crosses the slop radius and decides
  // the gesture, the second carries it the rest of the way.
  fireEvent.touchMove(el, touch(Math.sign(dx) * Math.min(Math.abs(dx), 12), Math.sign(dy) * Math.min(Math.abs(dy), 12)));
  fireEvent.touchMove(el, touch(dx, dy));
}

function release(el: HTMLElement) {
  fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: 0, clientY: 0 }] });
}

describe('usePullToRefresh', () => {
  it('shows nothing until a pull is underway', () => {
    render(<Harness onRefresh={vi.fn()} />);
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull();
  });

  it('springs back without refreshing on a short pull', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');

    drag(el, { dx: 0, dy: 30 });
    expect(screen.getByTestId('pull-to-refresh')).toHaveAttribute('data-state', 'pulling');

    release(el);
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('arms past the threshold, refreshes on release and spins until it settles', async () => {
    let settle: () => void = () => {};
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');

    drag(el, { dx: 0, dy: 100 });
    expect(screen.getByTestId('pull-to-refresh')).toHaveAttribute('data-state', 'armed');

    release(el);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-state', 'refreshing');
    expect(status.querySelector('.animate-spin')).not.toBeNull();

    settle();
    await waitFor(() => expect(screen.queryByTestId('pull-to-refresh')).toBeNull());
  });

  it('collapses even when the refresh fails', async () => {
    render(<Harness onRefresh={() => Promise.reject(new Error('offline'))} />);
    const el = screen.getByTestId('scroller');
    drag(el, { dx: 0, dy: 100 });
    release(el);
    await waitFor(() => expect(screen.queryByTestId('pull-to-refresh')).toBeNull());
  });

  it('cancels the scroll only once the pull is its own', () => {
    render(<Harness onRefresh={vi.fn()} />);
    const el = screen.getByTestId('scroller');
    fireEvent.touchStart(el, touch(0, 0));
    // Inside the slop radius nothing is decided, so the browser keeps the event.
    expect(fireEvent.touchMove(el, touch(0, 4))).toBe(true);
    expect(fireEvent.touchMove(el, touch(0, 40))).toBe(false);
  });

  it('leaves a sideways drag to the swipe rows', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');

    drag(el, { dx: 120, dy: 100 });
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull();
    release(el);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('never starts when the region is scrolled', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 80 });

    drag(el, { dx: 0, dy: 100 });
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull();
    release(el);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('is inert when disabled', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} enabled={false} />);
    const el = screen.getByTestId('scroller');
    drag(el, { dx: 0, dy: 100 });
    release(el);
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
