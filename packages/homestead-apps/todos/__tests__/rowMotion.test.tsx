/**
 * The list's motion, checked at the seams where it is wired rather than at the
 * CSS (which the browser owns): a row rises in on the delay it is given, a
 * leaving row collapses and leaves the accessibility tree, and the hook that
 * holds leaving rows keeps them in place, lets them come back, and releases
 * them on the animation's end or — where no animation ever ends — on a timer.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodoRow } from '../components/TodoRow';
import { useLeavingRows, cascadeDelayMs, MAX_STAGGERED_ROWS, ROW_STAGGER_MS } from '@rambleraptor/homestead-core/shared/hooks/useLeavingRows';
import type { TodoItem } from '../types';

function todo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    path: 'todos/t1',
    title: 'Take the bins out',
    status: 'pending',
    create_time: '2026-01-01T00:00:00Z',
    update_time: '2026-01-01T00:00:00Z',
    kind: 'family',
    ...overrides,
  } as TodoItem;
}

function renderRow(props: Partial<React.ComponentProps<typeof TodoRow>> = {}) {
  const { container, rerender } = render(
    <MemoryRouter>
      <TodoRow todo={todo()} variant="active" onSetStatus={vi.fn()} {...props} />
    </MemoryRouter>,
  );
  // The animated shell is the outermost element the component renders.
  return {
    shell: () => container.firstElementChild as HTMLElement,
    rerender: (next: Partial<React.ComponentProps<typeof TodoRow>>) =>
      rerender(
        <MemoryRouter>
          <TodoRow todo={todo()} variant="active" onSetStatus={vi.fn()} {...props} {...next} />
        </MemoryRouter>,
      ),
  };
}

describe('TodoRow entrance', () => {
  it('rises into place', () => {
    expect(renderRow().shell().className).toContain('animate-field-rise');
  });

  it('holds its entrance back by the delay the caller sets', () => {
    expect(renderRow({ enterDelayMs: 66 }).shell().style.animationDelay).toBe('66ms');
  });

  it('keeps the delay it mounted with, so a later re-sort does not retime it', () => {
    const row = renderRow({ enterDelayMs: 66 });
    row.rerender({ enterDelayMs: 0 });
    expect(row.shell().style.animationDelay).toBe('66ms');
  });

  it('keeps the row itself, and its actions, where the specs find them', () => {
    renderRow();
    expect(screen.getByTestId('todo-row-t1')).toBeInTheDocument();
    expect(screen.getByTestId('todo-row-t1-complete')).toBeInTheDocument();
  });
});

describe('TodoRow exit', () => {
  it('collapses instead of rising when it is on its way out', () => {
    const shell = renderRow({ exiting: true }).shell();
    expect(shell.className).toContain('animate-row-collapse');
    expect(shell.className).not.toContain('animate-field-rise');
    expect(shell.style.animationDelay).toBe('');
  });

  it('leaves the accessibility tree and the reach of a click on the way out', () => {
    const shell = renderRow({ exiting: true }).shell();
    expect(shell).toHaveAttribute('aria-hidden', 'true');
    expect(shell.className).toContain('pointer-events-none');
  });

  it('stays an ordinary row otherwise', () => {
    expect(renderRow().shell()).not.toHaveAttribute('aria-hidden');
  });

  it('reports the end of its own collapse, and nothing else', () => {
    const onExited = vi.fn();
    const shell = renderRow({ exiting: true, onExited }).shell();

    // A child's animation (the remote-change flash) bubbles up; not ours.
    fireEvent.animationEnd(shell.firstElementChild!, { animationName: 'row-collapse' });
    fireEvent.animationEnd(shell, { animationName: 'field-rise' });
    expect(onExited).not.toHaveBeenCalled();

    fireEvent.animationEnd(shell, { animationName: 'row-collapse' });
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('does not report a collapse it is not playing', () => {
    const onExited = vi.fn();
    const shell = renderRow({ onExited }).shell();
    fireEvent.animationEnd(shell, { animationName: 'row-collapse' });
    expect(onExited).not.toHaveBeenCalled();
  });
});

describe('cascadeDelayMs', () => {
  it('staggers the first rows and lands the rest together', () => {
    expect(cascadeDelayMs(0)).toBe(0);
    expect(cascadeDelayMs(3)).toBe(3 * ROW_STAGGER_MS);
    expect(cascadeDelayMs(MAX_STAGGERED_ROWS + 20)).toBe(MAX_STAGGERED_ROWS * ROW_STAGGER_MS);
  });
});

describe('useLeavingRows', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const items = (...ids: string[]) => ids.map((id) => ({ id }));

  it('passes live rows through, marking the first paint', () => {
    const { result, rerender } = renderHook(({ list }) => useLeavingRows(list), {
      initialProps: { list: items('a', 'b') },
    });
    expect(result.current.rows.map((r) => [r.item.id, r.exiting, r.firstPaint])).toEqual([
      ['a', false, true],
      ['b', false, true],
    ]);

    // A row added later is not part of the cascade.
    rerender({ list: items('a', 'b', 'c') });
    expect(result.current.rows.find((r) => r.item.id === 'c')?.firstPaint).toBe(false);
  });

  it('keeps a leaving row in its place after the data drops it', () => {
    const { result, rerender } = renderHook(({ list }) => useLeavingRows(list), {
      initialProps: { list: items('a', 'b', 'c') },
    });
    act(() => result.current.leave({ id: 'b' }));
    rerender({ list: items('a', 'c') });

    expect(result.current.rows.map((r) => [r.item.id, r.exiting])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
  });

  it('keeps neighbours that leave together in order, and a last row at the end', () => {
    const { result, rerender } = renderHook(({ list }) => useLeavingRows(list), {
      initialProps: { list: items('a', 'b', 'c', 'd') },
    });
    act(() => {
      result.current.leave({ id: 'b' });
      result.current.leave({ id: 'c' });
      result.current.leave({ id: 'd' });
    });
    rerender({ list: items('a') });

    expect(result.current.rows.map((r) => r.item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.current.rows.slice(1).every((r) => r.exiting)).toBe(true);
  });

  it('lets a row that comes back stop leaving', () => {
    const { result, rerender } = renderHook(({ list }) => useLeavingRows(list), {
      initialProps: { list: items('a', 'b') },
    });
    act(() => result.current.leave({ id: 'b' }));
    rerender({ list: items('a') });
    expect(result.current.rows.find((r) => r.item.id === 'b')?.exiting).toBe(true);

    // The undo put it back.
    rerender({ list: items('a', 'b') });
    expect(result.current.rows.map((r) => [r.item.id, r.exiting])).toEqual([
      ['a', false],
      ['b', false],
    ]);
  });

  it('drops the row once its collapse is reported', () => {
    const { result, rerender } = renderHook(({ list }) => useLeavingRows(list), {
      initialProps: { list: items('a', 'b') },
    });
    act(() => result.current.leave({ id: 'b' }));
    rerender({ list: items('a') });
    act(() => result.current.release('b'));
    expect(result.current.rows.map((r) => r.item.id)).toEqual(['a']);
  });

  it('drops the row on a timer where no animation ever ends', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ list }) => useLeavingRows(list), {
      initialProps: { list: items('a', 'b') },
    });
    act(() => result.current.leave({ id: 'b' }));
    rerender({ list: items('a') });
    expect(result.current.rows).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.rows.map((r) => r.item.id)).toEqual(['a']);
  });

  it('holds nothing back under reduced motion', () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      const { result, rerender } = renderHook(({ list }) => useLeavingRows(list), {
        initialProps: { list: items('a', 'b') },
      });
      act(() => result.current.leave({ id: 'b' }));
      rerender({ list: items('a') });
      expect(result.current.rows.map((r) => r.item.id)).toEqual(['a']);
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});
