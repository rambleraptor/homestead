/**
 * The hooks apps use to react to other people's changes. Events are pushed in
 * with `publishRemoteChange`, the way the change feed hands them over.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as toastModule from '../../shared/components/ToastProvider';
import {
  CHANGE_TOAST_WINDOW_MS,
  RECENT_CHANGE_MS,
  actorLabel,
  publishRemoteChange,
  useChangeToasts,
  useRecentRemoteChanges,
  useRemoteEdits,
  useResourceEvents,
  type RemoteChange,
} from '../remoteChanges';
import type { ResourceEventData, ResourceEventType } from '../resourceEvents';

vi.mock('../aepbase', () => ({ authStore: { model: { id: 'test-user-id' } } }));

const SAM = { actor: 'users/sam', actor_name: 'Sam' };
const ME = { actor: 'users/test-user-id', actor_name: 'Test User' };

function publish(
  type: ResourceEventType,
  id: string,
  opts: {
    resource?: string;
    who?: typeof SAM;
    record?: Record<string, unknown>;
    previous?: Record<string, unknown>;
  } = {},
) {
  const { resource = 'grocery', who = SAM, record = { id, name: id }, previous } = opts;
  const data: ResourceEventData = {
    resource,
    path: `${resource}s/${id}`,
    id,
    actor: who.actor,
    actor_name: who.actor_name,
    origin: 'web-other',
    update_time: '2026-10-22T00:00:00Z',
    record: type === 'resource.deleted' ? undefined : record,
  };
  act(() => publishRemoteChange(type, data, previous));
}

describe('useResourceEvents', () => {
  it('hands over each change to the resource, with who made it and the prior state', () => {
    const seen: RemoteChange[] = [];
    renderHook(() => useResourceEvents('grocery', (c) => seen.push(c)));

    publish('resource.updated', 'milk', {
      record: { id: 'milk', checked: true },
      previous: { id: 'milk', checked: false },
    });
    publish('resource.created', 'bins', { resource: 'todo' });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      kind: 'updated',
      resource: 'grocery',
      id: 'milk',
      actor: 'users/sam',
      actorName: 'Sam',
      byMe: false,
      record: { checked: true },
      previous: { checked: false },
    });
  });

  it('flags the signed-in user’s changes from elsewhere', () => {
    const seen: RemoteChange[] = [];
    renderHook(() => useResourceEvents(['grocery', 'store'], (c) => seen.push(c)));

    publish('resource.deleted', 'milk', { who: ME });

    expect(seen[0]).toMatchObject({ kind: 'deleted', byMe: true });
    expect(seen[0]!.record).toBeUndefined();
  });

  it('always calls the latest handler, and none once disabled or unmounted', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ handler, enabled }) => useResourceEvents('grocery', handler, { enabled }),
      { initialProps: { handler: first, enabled: true } },
    );

    rerender({ handler: second, enabled: true });
    publish('resource.created', 'a');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    rerender({ handler: second, enabled: false });
    publish('resource.created', 'b');
    unmount();
    publish('resource.created', 'c');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps delivering to other listeners when one throws', () => {
    const after = vi.fn();
    renderHook(() =>
      useResourceEvents('grocery', () => {
        throw new Error('boom');
      }),
    );
    renderHook(() => useResourceEvents('grocery', after));

    publish('resource.created', 'a');

    expect(after).toHaveBeenCalledTimes(1);
  });
});

describe('actorLabel', () => {
  it('names the person, says "You" for the signed-in user, and falls back to "Someone"', () => {
    expect(actorLabel({ actorName: 'Sam', byMe: false })).toBe('Sam');
    expect(actorLabel({ actorName: 'Test User', byMe: true })).toBe('You');
    expect(actorLabel({ actorName: null, byMe: false })).toBe('Someone');
  });
});

describe('useRecentRemoteChanges', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds the latest change per record for a few seconds', () => {
    const { result } = renderHook(() => useRecentRemoteChanges('grocery'));

    publish('resource.updated', 'milk');
    expect(result.current.get('milk')).toMatchObject({ actorName: 'Sam' });

    act(() => vi.advanceTimersByTime(RECENT_CHANGE_MS - 1_000));
    publish('resource.updated', 'milk'); // a second change restarts the clock
    act(() => vi.advanceTimersByTime(RECENT_CHANGE_MS - 1));
    expect(result.current.has('milk')).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.has('milk')).toBe(false);
  });

  it('ignores the signed-in user’s own changes unless asked', () => {
    const others = renderHook(() => useRecentRemoteChanges('grocery'));
    const everyone = renderHook(() => useRecentRemoteChanges('grocery', { includeMine: true }));

    publish('resource.updated', 'milk', { who: ME });

    expect(others.result.current.size).toBe(0);
    expect(everyone.result.current.has('milk')).toBe(true);
  });
});

describe('useChangeToasts', () => {
  const info = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    info.mockReset();
    vi.spyOn(toastModule, 'useToast').mockReturnValue({
      info,
    } as unknown as ReturnType<typeof toastModule.useToast>);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const describeIt = (c: RemoteChange) =>
    c.id === 'skip' ? null : `${actorLabel(c)} touched ${c.id}`;

  it('toasts one change in its own words', () => {
    renderHook(() => useChangeToasts('grocery', describeIt));

    publish('resource.updated', 'milk');
    expect(info).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(CHANGE_TOAST_WINDOW_MS));

    expect(info).toHaveBeenCalledExactlyOnceWith('Sam touched milk');
  });

  it('collapses a burst into one summary, skipping what describe declines', () => {
    const summarize = vi.fn((changes: RemoteChange[]) => `${changes.length} things`);
    renderHook(() => useChangeToasts('grocery', describeIt, { summarize }));

    publish('resource.deleted', 'a');
    publish('resource.deleted', 'skip');
    publish('resource.deleted', 'b');
    act(() => vi.advanceTimersByTime(CHANGE_TOAST_WINDOW_MS));

    expect(info).toHaveBeenCalledExactlyOnceWith('2 things');
    expect(summarize.mock.calls[0]![0].map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('summarizes by person when the app gives no summary', () => {
    renderHook(() => useChangeToasts('grocery', describeIt));

    publish('resource.created', 'a');
    publish('resource.created', 'b');
    act(() => vi.advanceTimersByTime(CHANGE_TOAST_WINDOW_MS));
    publish('resource.created', 'c');
    publish('resource.created', 'd', { who: { actor: 'users/kim', actor_name: 'Kim' } });
    act(() => vi.advanceTimersByTime(CHANGE_TOAST_WINDOW_MS));

    expect(info.mock.calls).toEqual([['Sam made 2 changes'], ['2 changes from others']]);
  });

  it('stays quiet about the signed-in user’s own changes', () => {
    renderHook(() => useChangeToasts('grocery', describeIt));

    publish('resource.updated', 'milk', { who: ME });
    act(() => vi.advanceTimersByTime(CHANGE_TOAST_WINDOW_MS));

    expect(info).not.toHaveBeenCalled();
  });

  it('drops a pending toast when unmounted', () => {
    const { unmount } = renderHook(() => useChangeToasts('grocery', describeIt));

    publish('resource.updated', 'milk');
    unmount();
    act(() => vi.advanceTimersByTime(CHANGE_TOAST_WINDOW_MS));

    expect(info).not.toHaveBeenCalled();
  });
});

describe('useRemoteEdits', () => {
  it('reports a save or delete of the watched record, from anyone but this tab', () => {
    const { result } = renderHook(() => useRemoteEdits('recipe', 'r1'));

    publish('resource.updated', 'r2', { resource: 'recipe' });
    publish('resource.created', 'r1', { resource: 'recipe' });
    expect(result.current.change).toBeNull();

    publish('resource.updated', 'r1', { resource: 'recipe', who: ME });
    expect(result.current.change).toMatchObject({ kind: 'updated', byMe: true });

    publish('resource.deleted', 'r1', { resource: 'recipe' });
    expect(result.current.change).toMatchObject({ kind: 'deleted', actorName: 'Sam' });

    act(() => result.current.dismiss());
    expect(result.current.change).toBeNull();
  });

  it('starts clean when the form reopens or moves to another record', () => {
    const { result, rerender } = renderHook(
      ({ id, enabled }) => useRemoteEdits('recipe', id, { enabled }),
      { initialProps: { id: 'r1', enabled: true } },
    );

    publish('resource.updated', 'r1', { resource: 'recipe' });
    expect(result.current.change).not.toBeNull();

    rerender({ id: 'r1', enabled: false });
    expect(result.current.change).toBeNull();
    publish('resource.updated', 'r1', { resource: 'recipe' });
    rerender({ id: 'r1', enabled: true });
    expect(result.current.change).toBeNull();

    publish('resource.updated', 'r1', { resource: 'recipe' });
    rerender({ id: 'r2', enabled: true });
    expect(result.current.change).toBeNull();
  });
});
