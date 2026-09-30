/**
 * Who is making the engine request currently in progress.
 *
 * Post-commit observers (the change feed) need the writer's identity and the
 * client-supplied origin tag, but the write handlers don't all receive the
 * caller, and threading it through every one of them for an observer's sake
 * would widen a dozen signatures. The engine instead runs each request inside
 * this context, and an observer invoked synchronously from a handler reads it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from './types';

/** Request header a client sets to tag its own writes (see change-feed.ts). */
export const ORIGIN_HEADER = 'x-homestead-client';

/** Longest origin tag accepted; anything longer is dropped, not truncated. */
const MAX_ORIGIN_LENGTH = 128;

export interface RequestContext {
  caller: User | null;
  /** The writer's self-chosen client tag, if it sent a well-formed one. */
  origin: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The origin tag from a request, if present and well-formed. */
export function originOf(req: Request): string | null {
  const raw = req.headers.get(ORIGIN_HEADER);
  if (!raw || raw.length > MAX_ORIGIN_LENGTH) return null;
  return /^[A-Za-z0-9_.:-]+$/.test(raw) ? raw : null;
}
