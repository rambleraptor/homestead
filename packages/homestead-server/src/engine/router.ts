/**
 * Dynamic-resource route resolution. The Go server rebuilt an http.ServeMux
 * whenever definitions changed; here a single dispatcher matches request
 * segments against the registry on every request, so runtime definition
 * changes need no rebuild.
 */

import {
  buildResourcePath,
  checkSuperuserWrite,
  checkUserScope,
  handleApply,
  handleCreate,
  handleDelete,
  handleDownload,
  handleGet,
  handleList,
  handleSingletonGet,
  handleSingletonUpdate,
  handleUpdate,
  type RouteMatch,
} from './crud';
import { errorResponse } from './errors';
import {
  enforceGrantWrite,
  credentialVisibilityClause,
  enforceCredentialCeiling,
  enforceRecordAccess,
  listVisibilityClause,
  validateGrantFilter,
  type EnforceContext,
  type GrantTargetSpec,
} from './enforce';
import { sanitizeTableName } from './db';
import { createLogger } from '../log';
import type { RegisteredResource, Registry } from './registry';
import type { User } from './types';

const log = createLogger('permissions');

const ACCESS_GRANTS_PLURAL = 'access-grants';

/** Go's http.ServeMux fallback for unrouted paths. */
export function notFoundText(): Response {
  return new Response('404 page not found\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function methodNotAllowed(): Response {
  return new Response('Method Not Allowed\n', {
    status: 405,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Match request segments against an element pattern. Even positions are
 * literal collection names; odd positions are `{param}` captures. Returns
 * the captured params, or null when literals don't line up.
 */
function matchElems(segments: string[], elems: string[]): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let i = 0; i < elems.length; i++) {
    const elem = elems[i]!;
    const seg = segments[i]!;
    if (elem.startsWith('{')) {
      if (seg === '') return null;
      params[elem.slice(1, -1)] = decodeURIComponent(seg);
    } else if (elem !== seg) {
      return null;
    }
  }
  return params;
}

interface ResolvedRoute {
  match: RouteMatch;
  /** The raw last segment for resource-kind matches (may carry ":verb"). */
  rawId: string;
}

function resolve(reg: Registry, segments: string[]): ResolvedRoute | null {
  for (const r of reg.dynamic()) {
    if (r.singleton) {
      const elems = reg.singletonRouteElems(r);
      if (segments.length !== elems.length) continue;
      // Last element is the literal singular name; the rest is the parent pattern.
      const params = matchElems(segments, elems);
      if (!params) continue;
      return {
        match: { resource: r, parentIds: params, id: '', verb: '', kind: 'singleton' },
        rawId: '',
      };
    }

    const elems = r.patternElems;
    if (segments.length === elems.length - 1) {
      const params = matchElems(segments, elems.slice(0, -1));
      if (!params) continue;
      return {
        match: { resource: r, parentIds: params, id: '', verb: '', kind: 'collection' },
        rawId: '',
      };
    }
    if (segments.length === elems.length) {
      const params = matchElems(segments.slice(0, -1), elems.slice(0, -1));
      if (!params) continue;
      return {
        match: {
          resource: r,
          parentIds: params,
          id: segments[segments.length - 1]!,
          verb: '',
          kind: 'resource',
        },
        rawId: decodeURIComponent(segments[segments.length - 1]!),
      };
    }
  }
  return null;
}

/**
 * Resolve an AEP resource path (`groceries/abc`, `credit-cards/1/perks/2`, or a
 * singleton's path) to its route match — the same resolution a request for
 * that path gets. Null when no registered resource owns the path.
 */
export function matchResourcePath(reg: Registry, path: string): RouteMatch | null {
  const segments = path.split('/').filter((s) => s.length > 0);
  const resolved = resolve(reg, segments);
  if (!resolved) return null;
  const { match, rawId } = resolved;
  if (match.kind === 'collection') return null;
  if (match.kind === 'resource') match.id = rawId;
  return match;
}

/**
 * Authorize reading one record (or a singleton): the checks a GET of it runs,
 * in the same order. Throws HttpError(403) when denied.
 *
 * Shared by the GET routes below and by the change feed, which must decide
 * whether a subscriber may see a record exactly as a GET would — a second copy
 * of this sequence would be a second copy to keep in step.
 */
export function authorizeRecordRead(
  reg: Registry,
  match: RouteMatch,
  caller: User | null,
  ctx?: EnforceContext,
): void {
  checkUserScope(match, caller);
  if (!ctx) return;
  const r = match.resource;
  // Grant rows are readable by any authenticated caller (see routeGrant).
  if (r.plural === ACCESS_GRANTS_PLURAL) return;
  const opts = {
    caller,
    verb: 'read' as const,
    resourceType: r.singular,
    plural: r.plural,
    schema: r.schema,
    ...(match.kind === 'resource'
      ? { recordId: match.id, recordPath: buildResourcePath(r, match.parentIds, match.id) }
      : {}),
  };
  if (match.parentIds.user_id !== undefined) enforceCredentialCeiling(ctx, reg.db, opts);
  else enforceRecordAccess(ctx, reg.db, opts);
}

/**
 * Warn (once per process) that no baseline (grant/role) exists yet. Enforcement
 * is fail-closed, so until one is seeded a non-superuser sees only their own
 * owned rows — the superuser (break-glass) still has full access to seed/recover.
 * Surfaces a mis-seeded instance without spamming a line per request.
 */
let warnedNoBaseline = false;
function warnNoBaseline(): void {
  if (warnedNoBaseline) return;
  warnedNoBaseline = true;
  log.warn(
    'no permission baseline (grant/role) exists yet — enforcing fail-closed: ' +
      'non-superusers are limited to their own rows until one is seeded. ' +
      'This is expected briefly at first boot, while the superuser seeds it.',
  );
}

/**
 * Route a request against the dynamic resources. Returns null when no
 * resource pattern matches (callers fall through to the 404 text).
 */
export async function routeDynamic(
  reg: Registry,
  req: Request,
  segments: string[],
  caller: User | null,
  ctx?: EnforceContext,
): Promise<Response | null> {
  const resolved = resolve(reg, segments);
  if (!resolved) return null;

  const { match, rawId } = resolved;
  const r: RegisteredResource = match.resource;
  // Enforcement is unconditional (fail-CLOSED): whenever we have a permission
  // context we consult grants, with no "no baseline yet → open" valve. A caller
  // with no applicable grant falls back to their own owned rows (LIST) or a 403
  // (single-record) — a missing/wiped baseline locks the household down rather
  // than exposing every row to every account. The superuser bypasses via the
  // resolver (break-glass), so the boot seeder and manual recovery always work.
  // A ctx-less caller (internal loopback ops / unit tests) still skips it.
  const enforcing = ctx !== undefined;
  if (enforcing && !ctx!.store.hasBaseline()) warnNoBaseline();

  // User-subtree isolation always applies: a child of `user` stays owner-only,
  // preserving the privacy of notifications/preferences/etc. The grant system
  // layers *additional* restriction on top for the shared, top-level resources
  // (where checkUserScope is a no-op). The blanket open grant must not be able
  // to widen access to another user's subtree.
  checkUserScope(match, caller);

  // Grant enforcement governs shared, top-level collections. Children of `user`
  // are governed by checkUserScope (subtree ownership by path) instead: a record
  // in a user's subtree may have been created *for* them by someone else (a
  // system notification, a superuser-set account tag) so its `_owner` isn't the
  // subtree user — applying grant/owner visibility there would wrongly hide it.
  // checkUserScope already denies cross-user access, so grants add nothing here.
  //
  // What that reasoning does *not* excuse is the credential ceiling: how far a
  // PAT or an OAuth token was scoped is a property of the credential, not of the
  // record's owner, so it still applies inside the subtree. Skipping it there
  // let a read-scoped token write its owner's user-parented records — including
  // minting itself a broader token.
  const userScoped = match.parentIds.user_id !== undefined;
  const enforceGrants = enforcing && !userScoped;

  // `access-grant` governs its own writes by the manage-on-target rule (§15.3)
  // rather than the generic resolve/superuser_write path. `enforceGrantWrite`
  // lets the superuser (break-glass) seed the first grant even when no baseline
  // exists yet, so this path is safe from the very first boot. A ctx-less caller
  // (internal loopback / unit tests) falls through to the generic handling.
  if (r.plural === ACCESS_GRANTS_PLURAL && enforcing) {
    return routeGrant(reg, req, match, rawId, caller, ctx!);
  }

  const enforce = (verb: 'read' | 'write', recordId?: string, recordPath?: string): void => {
    if (!enforcing) return;
    const opts = {
      caller,
      verb,
      resourceType: r.singular,
      plural: r.plural,
      schema: r.schema,
      recordId,
      recordPath,
    };
    // enforceRecordAccess runs the owner-side pass *and* the credential ceiling;
    // where the owner-side pass is skipped, the ceiling still has to run.
    if (enforceGrants) enforceRecordAccess(ctx, reg.db, opts);
    else enforceCredentialCeiling(ctx, reg.db, opts);
  };

  if (match.kind === 'singleton') {
    if (req.method === 'GET') {
      authorizeRecordRead(reg, match, caller, ctx);
      return handleSingletonGet(reg, match);
    }
    if (req.method === 'PATCH') {
      checkSuperuserWrite(match, caller);
      enforce('write');
      return handleSingletonUpdate(reg, match, req);
    }
    return methodNotAllowed();
  }

  if (match.kind === 'collection') {
    if (req.method === 'POST') {
      checkSuperuserWrite(match, caller);
      enforce('write');
      return handleCreate(reg, match, req, caller);
    }
    if (req.method === 'GET') {
      const listOpts = {
        caller,
        resourceType: r.singular,
        plural: r.plural,
        schema: r.schema,
      };
      const visibility = enforceGrants
        ? listVisibilityClause(ctx, listOpts)
        : enforcing
          ? credentialVisibilityClause(ctx, listOpts)
          : null;
      return handleList(reg, match, req, visibility);
    }
    return methodNotAllowed();
  }

  // Resource-kind: GET/POST split a trailing :verb; other methods treat the
  // raw segment as the id (a colon id then simply misses), matching Go.
  const colon = rawId.indexOf(':');
  if ((req.method === 'GET' || req.method === 'POST') && colon >= 0) {
    match.id = rawId.slice(0, colon);
    match.verb = rawId.slice(colon + 1);
  } else {
    match.id = rawId;
  }
  const recordPath = buildResourcePath(r, match.parentIds, match.id);

  switch (req.method) {
    case 'GET':
      if (match.verb !== '') {
        return errorResponse(404, `custom method "${match.verb}" not found`);
      }
      authorizeRecordRead(reg, match, caller, ctx);
      return handleGet(reg, match);
    case 'POST':
      if (match.verb === '') {
        return errorResponse(405, 'POST is not allowed on individual resources; use PATCH to update');
      }
      if (match.verb === 'download' && r.fileFields.size > 0) {
        enforce('read', match.id, recordPath);
        return handleDownload(reg, match, req);
      }
      return errorResponse(404, `custom method "${match.verb}" not found`);
    case 'PATCH':
      checkSuperuserWrite(match, caller);
      enforce('write', match.id, recordPath);
      return handleUpdate(reg, match, req);
    case 'PUT':
      checkSuperuserWrite(match, caller);
      enforce('write', match.id, recordPath);
      return handleApply(reg, match, req, caller);
    case 'DELETE':
      checkSuperuserWrite(match, caller);
      enforce('write', match.id, recordPath);
      return handleDelete(reg, match, req);
    default:
      return methodNotAllowed();
  }
}

/**
 * Route a request to the `access-grant` collection under the manage-on-target
 * write rule (§15.3). Reads are open to any authenticated caller (household
 * transparency); writes require `manage` on the grant's target, enforced by
 * `enforceGrantWrite`. Superuser bypass is handled inside it.
 */
async function routeGrant(
  reg: Registry,
  req: Request,
  match: RouteMatch,
  rawId: string,
  caller: User | null,
  ctx: EnforceContext,
): Promise<Response> {
  const r = match.resource;

  if (match.kind === 'collection') {
    if (req.method === 'GET') return handleList(reg, match, req, null);
    if (req.method === 'POST') {
      const { bodyText, target, filter } = await readGrantTarget(req);
      enforceGrantWrite(ctx, reg, reg.db, caller, target);
      validateGrantFilter(reg, target, filter);
      return handleCreate(reg, match, remakeJsonRequest(req, bodyText), caller);
    }
    return methodNotAllowed();
  }

  match.id = rawId;
  const path = buildResourcePath(r, match.parentIds, match.id);

  switch (req.method) {
    case 'GET':
      return handleGet(reg, match);
    case 'PATCH': {
      const { bodyText, target, filter } = await readGrantTarget(req, storedGrantTarget(reg, r.plural, path));
      enforceGrantWrite(ctx, reg, reg.db, caller, target);
      validateGrantFilter(reg, target, filter);
      return handleUpdate(reg, match, remakeJsonRequest(req, bodyText));
    }
    case 'PUT': {
      const { bodyText, target, filter } = await readGrantTarget(req, storedGrantTarget(reg, r.plural, path));
      enforceGrantWrite(ctx, reg, reg.db, caller, target);
      validateGrantFilter(reg, target, filter);
      return handleApply(reg, match, remakeJsonRequest(req, bodyText), caller);
    }
    case 'DELETE':
      enforceGrantWrite(ctx, reg, reg.db, caller, storedGrantTarget(reg, r.plural, path));
      return handleDelete(reg, match, req);
    default:
      return methodNotAllowed();
  }
}

/**
 * The grant's effective target = the request body overlaid on any stored row,
 * plus the `filter` value the body sets (undefined when the body doesn't touch
 * it) for write-time filter validation.
 */
async function readGrantTarget(
  req: Request,
  base: GrantTargetSpec = {},
): Promise<{ bodyText: string; target: GrantTargetSpec; filter: string | undefined }> {
  const bodyText = await req.text();
  let body: Record<string, unknown> = {};
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      // let the handler surface the invalid-JSON 400
    }
  }
  const pick = (k: string, fallback?: string): string | undefined =>
    typeof body[k] === 'string' ? (body[k] as string) : fallback;
  return {
    bodyText,
    target: {
      scope: pick('target_scope', base.scope),
      app: pick('target_app', base.app),
      resource_type: pick('resource_type', base.resource_type),
      resource_id: pick('resource_id', base.resource_id),
      subject_type: pick('subject_type', base.subject_type),
    },
    filter: typeof body.filter === 'string' ? (body.filter as string) : undefined,
  };
}

function storedGrantTarget(reg: Registry, plural: string, path: string): GrantTargetSpec {
  try {
    const row = reg.db
      .query(
        `SELECT subject_type, target_scope, target_app, resource_type, resource_id FROM ${sanitizeTableName(plural)} WHERE path = ?`,
      )
      .get(path) as Record<string, string | null> | null;
    if (!row) return {};
    return {
      scope: row.target_scope ?? undefined,
      app: row.target_app ?? undefined,
      resource_type: row.resource_type ?? undefined,
      resource_id: row.resource_id ?? undefined,
      subject_type: row.subject_type ?? undefined,
    };
  } catch {
    return {};
  }
}

function remakeJsonRequest(req: Request, bodyText: string): Request {
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: bodyText.length ? bodyText : undefined,
  });
}
