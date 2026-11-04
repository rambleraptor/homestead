/**
 * The service worker's navigation handler decides what an installed app shows
 * when it launches: the network's answer, or the cached shell. These run the
 * real `public/sw.js` against a fake worker scope and pin that decision.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(__dirname, '../../../public/sw.js'), 'utf8');

interface FetchEventLike {
  request: { url: string; method: string; mode: string };
  respondWith(response: Promise<unknown>): void;
  waitUntil(task: Promise<unknown>): void;
}

type Listener = (event: FetchEventLike) => void;

const ORIGIN = 'https://homestead.test';
const SHELL = { ok: true, status: 200, type: 'basic', shell: true };

/** Load the worker with `fetch` stubbed and the shell already cached. */
function loadWorker(fetchImpl: () => Promise<unknown>) {
  const listeners: Listener[] = [];
  const scope = {
    __HOMESTEAD_PRECACHE__: { version: 'test', urls: ['/index.html'], lazy: [] },
    location: { origin: ORIGIN },
    addEventListener(type: string, fn: Listener) {
      if (type === 'fetch') listeners.push(fn);
    },
    skipWaiting() {},
    clients: {},
    registration: {},
  };
  const caches = {
    match: vi.fn(async () => SHELL),
    open: vi.fn(),
    keys: vi.fn(async () => []),
  };
  new Function('self', 'caches', 'fetch', 'console', source)(scope, caches, fetchImpl, console);

  return {
    async navigate(path: string): Promise<unknown> {
      let answer: Promise<unknown> | undefined;
      const event: FetchEventLike = {
        request: { url: `${ORIGIN}${path}`, method: 'GET', mode: 'navigate' },
        respondWith: (response) => {
          answer = response;
        },
        waitUntil: () => {},
      };
      for (const listener of listeners) listener(event);
      if (!answer) throw new Error('the worker left the navigation to the browser');
      return answer;
    },
  };
}

describe('service worker navigation', () => {
  it("serves the network's page when it answers", async () => {
    const page = { ok: true, status: 200, type: 'basic' };
    const worker = loadWorker(async () => page);
    expect(await worker.navigate('/recipes')).toBe(page);
  });

  it('hands a redirect back to the browser instead of the cached shell', async () => {
    // A sign-in proxy (Cloudflare Access) answers a lapsed session with a
    // redirect to its sign-in page. The browser follows it only if it gets it.
    const redirect = { ok: false, status: 0, type: 'opaqueredirect' };
    const worker = loadWorker(async () => redirect);
    expect(await worker.navigate('/')).toBe(redirect);
  });

  it("passes a 4xx through: it is the server's answer", async () => {
    const forbidden = { ok: false, status: 403, type: 'basic' };
    const worker = loadWorker(async () => forbidden);
    expect(await worker.navigate('/')).toBe(forbidden);
  });

  it("falls back to the shell on a proxy's 502 while the server restarts", async () => {
    const worker = loadWorker(async () => ({ ok: false, status: 502, type: 'basic' }));
    expect(await worker.navigate('/')).toBe(SHELL);
  });

  it('falls back to the shell when the network fails', async () => {
    const worker = loadWorker(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await worker.navigate('/')).toBe(SHELL);
  });
});
