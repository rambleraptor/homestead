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

const systemWrites = new AsyncLocalStorage<true>();

/**
 * Run `fn` as a system write: an engine request made in-process from inside it
 * may set `system` fields (wire `x-aepbase-system`), which the engine otherwise
 * drops from every payload. Server code only — there is no way to ask for this
 * over HTTP, so a client can never write a system field.
 */
export function runAsSystemWrite<T>(fn: () => T): T {
  return systemWrites.run(true, fn);
}

/** Whether the current request is a system write (see {@link runAsSystemWrite}). */
export function isSystemWrite(): boolean {
  return systemWrites.getStore() === true;
}

const owners = new AsyncLocalStorage<string>();

/**
 * Run `fn` so that a record created by an engine request made in-process from
 * inside it belongs to `userId` rather than to the request's caller.
 *
 * A server job writes as the system, and the engine makes a record's creator
 * its owner — so what a job files *for* a person (a link collected into their
 * private bookmarks) would otherwise be the system's, and out of that
 * person's reach. Server code only, like {@link runAsSystemWrite}: there is no
 * way to ask for this over HTTP, so a client can never choose a record's owner.
 */
export function runAsOwner<T>(userId: string, fn: () => T): T {
  return owners.run(userId, fn);
}

/** The owner a create should be stamped with instead of its caller, if any (see {@link runAsOwner}). */
export function ownerOverride(): string | undefined {
  return owners.getStore();
}
