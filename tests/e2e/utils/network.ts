/**
 * `networkidle`, minus the change feed.
 *
 * Playwright's `waitForLoadState('networkidle')` waits for 500ms with no
 * request in flight. A signed-in tab holds `/api/events` (the server's SSE
 * change feed) open for as long as it lives, so the built-in never resolves
 * once the feed connects. This keeps the same meaning — 500ms of quiet — but
 * leaves long-lived streams out of the count.
 *
 * Requests are tracked from the moment {@link trackNetwork} attaches to a page;
 * the shared fixture does that when the page is created.
 */

import type { Page, Request } from '@playwright/test';

const IDLE_MS = 500;
const POLL_MS = 50;

/** Requests that stay open by design and never count as "in flight". */
function isLongLived(request: Request): boolean {
  return new URL(request.url()).pathname === '/api/events';
}

const inFlight = new WeakMap<Page, Set<Request>>();

export function trackNetwork(page: Page): void {
  if (inFlight.has(page)) return;
  const pending = new Set<Request>();
  inFlight.set(page, pending);
  page.on('request', (req) => {
    if (!isLongLived(req)) pending.add(req);
  });
  const done = (req: Request) => pending.delete(req);
  page.on('requestfinished', done);
  page.on('requestfailed', done);
}

/** Resolve once the page has loaded and no tracked request has been in flight for 500ms. */
export async function waitForNetworkIdle(page: Page, timeout = 30_000): Promise<void> {
  trackNetwork(page);
  await page.waitForLoadState('load');
  const pending = inFlight.get(page)!;
  const deadline = Date.now() + timeout;
  let quietSince = pending.size === 0 ? Date.now() : 0;
  while (Date.now() - quietSince < IDLE_MS || quietSince === 0) {
    if (Date.now() > deadline) {
      throw new Error(`waitForNetworkIdle: ${pending.size} request(s) still in flight after ${timeout}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    if (pending.size > 0) quietSince = 0;
    else if (quietSince === 0) quietSince = Date.now();
  }
}
