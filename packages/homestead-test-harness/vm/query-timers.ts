/**
 * React Query's timers (cache GC, retries, and the persister's throttled
 * localStorage save) routed through a provider the harness can cancel.
 *
 * A page unload kills every pending timer; a VM test's teardown has to do the
 * same by hand. Without it, the query persister's save (throttled by 2s)
 * fires after `close()` has cleared localStorage and writes the finished
 * test's cache into the next test's — whose next page load then hydrates
 * records from a database that no longer exists.
 */

import { timeoutManager } from '@tanstack/query-core';

type Timer = ReturnType<typeof setTimeout>;

const timeouts = new Set<Timer>();
const intervals = new Set<Timer>();

let installed = false;

export function installQueryTimers(): void {
  if (installed) return;
  installed = true;
  timeoutManager.setTimeoutProvider({
    setTimeout: (callback, delay) => {
      const id: Timer = setTimeout(() => {
        timeouts.delete(id);
        callback();
      }, delay);
      timeouts.add(id);
      return id;
    },
    clearTimeout: (id) => {
      clearTimeout(id as Timer);
      timeouts.delete(id as Timer);
    },
    setInterval: (callback, delay) => {
      const id: Timer = setInterval(callback, delay);
      intervals.add(id);
      return id;
    },
    clearInterval: (id) => {
      clearInterval(id as Timer);
      intervals.delete(id as Timer);
    },
  });
}

/** Cancel every pending React Query timer, as a page unload would. */
export function cancelQueryTimers(): void {
  for (const id of timeouts) clearTimeout(id);
  for (const id of intervals) clearInterval(id);
  timeouts.clear();
  intervals.clear();
}
