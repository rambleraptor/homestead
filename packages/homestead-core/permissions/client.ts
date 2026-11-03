/**
 * Client-side permission mirror (design §10). UX only — the engine is
 * authoritative; this just lets the SPA avoid showing actions/rows the server
 * would deny. It runs the *same* `resolve()` the server enforces with (imported
 * from ./resolve), over a context the server hands down at `/api/permissions/me`.
 */

import { resolve, type Grant, type Verb } from './resolve';
import { authorizedFetch, authStore } from '../api/aepbase';

export interface PermissionContext {
  /** Whether enforcement is actually on — the client only restricts when it is. */
  enforced: boolean;
  /** The caller's group ids. */
  groupIds: string[];
  /**
   * The caller's group *names* — feeds app-gating's `tagged` visibility mirror
   * (§9.2). Populated regardless of `enforced`, since app gating is independent
   * of permission enforcement.
   */
  groupNames: string[];
  /** Every applicable grant (role bundles already expanded server-side). */
  grants: Grant[];
  /**
   * Collection singulars the caller has at least one visible row of, where the
   * grants alone don't say so — i.e. access via a *filtered* grant, which
   * `canWith` deliberately won't evaluate client-side.
   *
   * Without this the sidebar can't tell "no access to documents" from "access to
   * your own documents", and hides the app in both cases. Computed server-side
   * (`engine/visible-rows.ts`), and row-dependent: it changes when data changes,
   * not only when grants do.
   */
  collectionsWithRows?: string[];
}

export interface CanOptions {
  /** The record being addressed, for a record-level check. */
  recordId?: string;
  /** The record's owner id, when the caller knows it (client rarely has `_owner`). */
  owner?: string;
  /** The app owning the resource, for app-scope grants (optional). */
  appId?: string | null;
}

/**
 * Fetch the caller's permission context (mirrors the engine's gatherFor). The
 * client can't enumerate its own group memberships over REST, so the server
 * assembles this. Returns undefined on any failure — `canWith` then stays
 * permissive.
 */
export async function fetchPermissionContext(): Promise<PermissionContext | undefined> {
  if (!authStore.token) return undefined;
  try {
    const res = await authorizedFetch('/api/permissions/me');
    if (!res.ok) return undefined;
    return (await res.json()) as PermissionContext;
  } catch {
    return undefined;
  }
}

/**
 * Fetch another user's permission context (superuser only, backs the Users-page
 * access summary). Same shape as `/me`, resolved server-side by the engine.
 * Returns undefined on any failure (missing token, not a superuser, network).
 */
export async function fetchPermissionContextFor(
  userId: string,
): Promise<PermissionContext | undefined> {
  if (!authStore.token || !userId) return undefined;
  try {
    const res = await authorizedFetch(`/api/permissions/user/${encodeURIComponent(userId)}`);
    if (!res.ok) return undefined;
    return (await res.json()) as PermissionContext;
  } catch {
    return undefined;
  }
}

/**
 * UX capability check. Permissive when enforcement is off or the context is
 * missing (the server allows everything then), so the UI never hides more than
 * the server denies. Filter grants aren't evaluated client-side (no
 * `filterEval`) — `can()` is conservative for filter-granted access, and the
 * server remains the authority.
 */
export function canWith(
  ctx: PermissionContext | undefined,
  userId: string,
  isSuperuser: boolean,
  verb: Verb,
  resourceType: string,
  opts: CanOptions = {},
): boolean {
  if (!ctx || !ctx.enforced || isSuperuser) return true;
  const decision = resolve(
    { isSuperuser },
    {
      verb,
      resourceType,
      appId: opts.appId ?? null,
      recordId: opts.recordId,
      recordOwner: opts.owner,
    },
    { userId, groupIds: new Set(ctx.groupIds) },
    ctx.grants,
  );
  return decision.allow;
}

/**
 * Would this collection's *nav visibility* change if its rows changed?
 *
 * Visibility normally follows the grants, which only change when an admin
 * changes them. The exception is a collection reached through a filtered grant:
 * there the sidebar depends on whether the caller currently has a visible row,
 * so creating your first document (or deleting your last) has to refresh the
 * permission context.
 *
 * Two cases, and they're the mirror of each other:
 *   - the collection is in `collectionsWithRows` → it could become empty;
 *   - the grants alone say the caller can't read it → it could become non-empty
 *     (that "no" is exactly the condition under which the server ran the
 *     existence query in the first place).
 *
 * Everything else — an ordinary household collection a role grants outright —
 * is already visible and stays visible, so no refresh is needed.
 */
export function isRowDependent(
  ctx: PermissionContext | undefined,
  userId: string,
  isSuperuser: boolean,
  resourceType: string,
  appId?: string | null,
): boolean {
  if (isSuperuser) return false; // break-glass: everything is visible anyway
  if ((ctx?.collectionsWithRows ?? []).includes(resourceType)) return true;
  return !canWith(ctx, userId, isSuperuser, 'read', resourceType, { appId });
}
