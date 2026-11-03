/**
 * Tests for `usePendingSync` / `usePendingSyncIds` / `useHasQueuedWrites`.
 *
 * The behaviour that matters is the discrimination: a write genuinely waiting
 * in the outbox for a connection must be reported, and an ordinary write on
 * its way to the server must not — otherwise every save in the app flashes an
 * "unsynced" marker for the length of its round trip. And since the outbox is
 * saved on the device, what's waiting is still known after a reload.
 */

import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { KeyValueStore } from '../offlineStore';
import { Outbox, type OutboxRequest } from '../outbox';
import { useHasQueuedWrites, usePendingSync, usePendingSyncIds } from '../usePendingSync';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
  };
}

/** An outbox whose connection and server replies the test controls. */
function controlledOutbox(store: KeyValueStore = memoryStore()) {
  let online = true;
  const replies: Array<() => void> = [];
  const outbox = new Outbox({
    store,
    secretFields: () => ({ byCollection: new Map(), names: new Set() }),
    isOnline: () => online,
    transport: {
      send: (r: OutboxRequest) =>
        new Promise((resolve) => replies.push(() => resolve({ path: r.name }))),
    },
  });
  return {
    outbox,
    goOffline: () => (online = false),
    goOnline: () => {
      online = true;
      return outbox.drain();
    },
    /** Answer every request the server has received so far. */
    answerAll: () => replies.splice(0).forEach((reply) => reply()),
  };
}

describe('usePendingSyncIds', () => {
  it('is empty when nothing is queued', () => {
    const { outbox } = controlledOutbox();
    const { result } = renderHook(() => usePendingSyncIds(outbox));
    expect(result.current.size).toBe(0);
  });

  it('reports each record with a write waiting offline, by its id', () => {
    const { outbox, goOffline } = controlledOutbox();
    goOffline();
    const { result } = renderHook(() => usePendingSyncIds(outbox));
    act(() => {
      outbox.enqueue('create', 'groceries/new1', { name: 'Milk' });
      outbox.enqueue('update', 'groceries/old1', { checked: true });
      outbox.enqueue('delete', 'credit-cards/c1/perks/p1');
    });
    expect([...result.current].sort()).toEqual(['new1', 'old1', 'p1']);
  });

  it('ignores an ordinary online write on its way to the server', async () => {
    const { outbox, answerAll } = controlledOutbox();
    const { result } = renderHook(() => usePendingSyncIds(outbox));
    act(() => {
      outbox.enqueue('update', 'groceries/old1', { checked: true });
    });
    expect(outbox.requests()).toHaveLength(1);
    expect(result.current.size).toBe(0);
    await act(async () => answerAll());
  });

  it('clears the id once the queue drains', async () => {
    const { outbox, goOffline, goOnline, answerAll } = controlledOutbox();
    goOffline();
    const { result } = renderHook(() => usePendingSyncIds(outbox));
    act(() => {
      outbox.enqueue('update', 'groceries/old1', { checked: true });
    });
    expect(result.current.has('old1')).toBe(true);

    await act(async () => {
      const draining = goOnline();
      answerAll();
      await draining;
    });
    await waitFor(() => expect(result.current.size).toBe(0));
  });

  it('still knows what is waiting after a reload', async () => {
    const store = memoryStore();
    const before = controlledOutbox(store);
    before.goOffline();
    before.outbox.enqueue('create', 'groceries/new1', { name: 'Milk' });
    await new Promise((r) => setTimeout(r, 0)); // let the save land

    const after = controlledOutbox(store);
    after.goOffline();
    await after.outbox.load();
    const { result } = renderHook(() => usePendingSyncIds(after.outbox));
    expect(result.current.has('new1')).toBe(true);
  });
});

describe('usePendingSync', () => {
  it('answers for one record', () => {
    const { outbox, goOffline } = controlledOutbox();
    goOffline();
    const { result } = renderHook(() => ({
      queued: usePendingSync('old1', outbox),
      other: usePendingSync('old2', outbox),
    }));
    act(() => {
      outbox.enqueue('update', 'groceries/old1', { checked: true });
    });
    expect(result.current).toEqual({ queued: true, other: false });
  });
});

describe('useHasQueuedWrites', () => {
  it('is false with an empty queue', () => {
    const { outbox } = controlledOutbox();
    const { result } = renderHook(() => useHasQueuedWrites(outbox));
    expect(result.current).toBe(false);
  });

  it('is true while a write waits for connectivity', () => {
    const { outbox, goOffline } = controlledOutbox();
    goOffline();
    const { result } = renderHook(() => useHasQueuedWrites(outbox));
    act(() => {
      outbox.enqueue('update', 'groceries/old1', { checked: true });
    });
    expect(result.current).toBe(true);
  });

  it('ignores an ordinary online write', async () => {
    const { outbox, answerAll } = controlledOutbox();
    const { result } = renderHook(() => useHasQueuedWrites(outbox));
    act(() => {
      outbox.enqueue('update', 'groceries/old1', { checked: true });
    });
    expect(result.current).toBe(false);
    await act(async () => answerAll());
  });
});
