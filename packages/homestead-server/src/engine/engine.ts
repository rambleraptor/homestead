/**
 * The engine: a fetch-style handler serving the full aepbase API surface at
 * bare paths (/users, /aep-resource-definitions, /openapi.json, dynamic
 * resources). Request flow mirrors the Go server: CORS/OPTIONS short-circuit
 * → bearer auth (with the same exemptions) → app-access check → route.
 */

import type { Database } from './sqlite';
import { join } from 'node:path';
import { createLogger } from '../log';
import { openDb } from './db';
import { errorResponse, HttpError } from './errors';
import {
  handleMetaCreate,
  handleMetaDelete,
  handleMetaGet,
  handleMetaList,
  handleMetaUpdate,
  loadAllDefinitions,
  topoSortDefs,
} from './meta';
import { OAuthRoutes, type OAuthConfig, type SessionIssuer } from './oauth';
import { buildOpenApi } from './openapi';
import { Registry } from './registry';
import { authorizeRecordRead, matchResourcePath, notFoundText, routeDynamic } from './router';
import { originOf, runWithRequestContext } from './request-context';
import { PermissionStore, permissionCacheTtlMs } from './permission-store';
import { type Grant } from './permissions';
import type { EnforceContext } from './enforce';
import { collectionsWithVisibleRows } from './visible-rows';
import { TYPE_SUPERUSER, type User } from './types';
import type { SyncDispatcher } from '../sync';
import {
  createUserTables,
  extractBearerToken,
  getUserById,
  getUserByToken,
  handleLogin,
  handleLogout,
  handleUserCreate,
  handleUserDelete,
  handleUserGet,
  handleUserList,
  handleUserUpdate,
  touchPatLastUsed,
} from './users';

const log = createLogger('engine');

/**
 * Hook for app-access gating (Phase 3): return a Response to short-circuit
 * the request, or null to continue.
 */
export type AccessCheck = (
  req: Request,
  segments: string[],
  caller: User | null,
) => Response | null;

/**
 * Resolves a bearer token to the calling user (or null if invalid/expired).
 * Injected the same way as {@link AccessCheck} so the auth service can own the
 * token lifecycle (expiry, revocation) without the engine knowing the rules.
 * When none is set the engine falls back to a plain {@link getUserByToken}.
 */
export type TokenValidator = (token: string) => Promise<User | null> | User | null;

export interface EngineOptions {
  /** Path to the sqlite file (or ":memory:"). */
  dbPath: string;
  /** On-disk root for file-field contents (data/files). */
  filesDir: string;
  /** Base URL echoed in file-field download URLs. */
  serverUrl: string;
  corsAllowedOrigins?: string[];
  accessCheck?: AccessCheck;
  /** Overrides the default bearer-token lookup (see {@link TokenValidator}). */
  tokenValidator?: TokenValidator;
  /** Mints federated-login sessions (see {@link SessionIssuer}). */
  sessionIssuer?: SessionIssuer;
  /** The `auth.oauth` block of homestead.config.ts (optional). */
  oauth?: OAuthConfig | null;
  /**
   * Optional post-commit resource-sync dispatcher (see {@link SyncDispatcher}).
   * When set, the engine fires it after a create/update/delete on a dynamic
   * resource or the built-in user, so app-declared syncs can mirror the change.
   * Omit to disable syncing entirely — every write path behaves identically
   * without it.
   */
  syncDispatcher?: SyncDispatcher | null;
}

export class Engine {
  readonly db: Database;
  readonly registry: Registry;
  private corsAllowedOrigins: string[];
  private accessCheck: AccessCheck | null;
  private tokenValidator: TokenValidator | null;
  private sessionIssuer: SessionIssuer | null;
  private oauth: OAuthRoutes | null;
  /** Post-commit resource-sync dispatcher, or null when syncing is disabled. */
  private syncDispatcher: SyncDispatcher | null;
  private readonly permissionStore: PermissionStore;
  /** Collection plural → owning app id, for app-scope grant matching. */
  private collectionToApp: Record<string, string> = {};

  constructor(opts: EngineOptions) {
    this.db = openDb(opts.dbPath);
    createUserTables(this.db);
    this.permissionStore = new PermissionStore(this.db, permissionCacheTtlMs());
    this.registry = new Registry(this.db, {
      filesDir: opts.filesDir,
      serverUrl: opts.serverUrl,
    });
    this.corsAllowedOrigins = opts.corsAllowedOrigins ?? [];
    this.accessCheck = opts.accessCheck ?? null;
    this.tokenValidator = opts.tokenValidator ?? null;
    this.sessionIssuer = opts.sessionIssuer ?? null;
    this.oauth = OAuthRoutes.fromConfig(this.db, opts.oauth);
    // Expose the sync dispatcher to the CRUD handlers via the registry they
    // already receive; the user handlers get it threaded through routeUsers.
    this.syncDispatcher = opts.syncDispatcher ?? null;
    this.registry.syncDispatcher = this.syncDispatcher;

    // Restore resource definitions from a previous run, parents first.
    for (const def of topoSortDefs(loadAllDefinitions(this.db))) {
      this.registry.addResource(def);
    }
  }

  setAccessCheck(check: AccessCheck | null): void {
    this.accessCheck = check;
  }

  /** Wire the collection→app map so app-scope grants can be matched. */
  setPermissionAppMap(collectionToApp: Record<string, string>): void {
    this.collectionToApp = collectionToApp;
  }

  private enforceContext(): EnforceContext {
    return {
      store: this.permissionStore,
      appIdFor: (plural) => this.collectionToApp[plural] ?? null,
    };
  }

  /**
   * The caller's permission context for the client `can()` mirror: their group
   * ids and every applicable grant (role bundles already expanded), plus whether
   * enforcement is live. Enforcement is unconditional and fail-closed, so
   * `enforced` is always true — the client must gate exactly as the server does,
   * even before the baseline seed lands (a grant-less caller simply resolves to
   * their own rows). The field is retained for wire/back-compat.
   */
  permissionContext(userId: string): {
    enforced: boolean;
    groupIds: string[];
    groupNames: string[];
    grants: Grant[];
    collectionsWithRows: string[];
  } {
    const { principals, grants } = this.permissionStore.gatherFor(userId);
    return {
      enforced: true,
      groupIds: [...principals.groupIds],
      // Group names feed the client's app-gating mirror (`tagged` visibility,
      // §9.2).
      groupNames: this.permissionStore.groupNamesFor(userId),
      grants,
      // Collections the caller has rows in but whose grants alone don't say so
      // (a filtered grant). Lets the sidebar tell "no access" apart from
      // "access, nothing to show" without the client evaluating filters.
      collectionsWithRows: collectionsWithVisibleRows(
        this.enforceContext(),
        this.db,
        this.registry,
        getUserById(this.db, userId)?.user ?? null,
      ),
    };
  }

  /**
   * The owning app id for a resource singular (or null), so callers outside the
   * engine can build an `AccessRequest` that matches app-scope grants. Used by
   * the token-mint route to check a requested grant against the owner's access.
   */
  appIdForResource(singular: string): string | null {
    const plural = this.registry.get(singular)?.plural;
    return plural ? this.collectionToApp[plural] ?? null : null;
  }

  /**
   * Drop the permission cache so a just-written grant, token, or membership is
   * honored on the very next request instead of waiting out the TTL. Called by
   * the token-mint/revoke route after it writes token-subject grants.
   */
  reloadPermissions(): void {
    this.permissionStore.clear();
  }

  setTokenValidator(validator: TokenValidator | null): void {
    this.tokenValidator = validator;
  }

  setSessionIssuer(issuer: SessionIssuer | null): void {
    this.sessionIssuer = issuer;
  }

  /**
   * Wire (or clear) the post-commit resource-sync dispatcher. Set here rather
   * than only at construction because the dispatcher is built from
   * `engine.db` — which doesn't exist until the engine has constructed — and
   * the shared operation store, exactly like the cron scheduler. Keeps the
   * registry's copy (the one CRUD handlers read) in sync.
   */
  setSyncDispatcher(dispatcher: SyncDispatcher | null): void {
    this.syncDispatcher = dispatcher;
    this.registry.syncDispatcher = dispatcher;
  }

  /** Make an engine-relative options object for a data dir (convenience). */
  static optionsForDataDir(
    dataDir: string,
    serverUrl: string,
    extra?: Partial<EngineOptions>,
  ): EngineOptions {
    return {
      dbPath: join(dataDir, 'aepbase.db'),
      filesDir: join(dataDir, 'files'),
      serverUrl,
      ...extra,
    };
  }

  /**
   * Resolve a bearer token to its caller, exactly as a request carrying it
   * would be (expiry, revocation, PAT/OAuth attenuation). Null when invalid.
   */
  async authenticateToken(token: string): Promise<User | null> {
    if (!token) return null;
    return this.tokenValidator ? this.tokenValidator(token) : getUserByToken(this.db, token);
  }

  /**
   * Whether `caller` may read the record at `path` (a resource of type
   * `resource`) — the same decision a GET of that path makes, run in-process
   * and synchronously. Evaluated against the database as it is now, so for a
   * delete it must run before the row goes.
   */
  canRead(caller: User, resource: string, path: string): boolean {
    const segments = path.split('/').filter((s) => s.length > 0);
    if (this.accessCheck) {
      const probe = new Request(`http://engine.local/${path}`, { method: 'GET' });
      if (this.accessCheck(probe, segments, caller)) return false;
    }
    if (resource === 'user') {
      // Mirrors handleUserGet: superusers, or the user themself.
      return caller.type === TYPE_SUPERUSER || segments[1] === caller.id;
    }
    const match = matchResourcePath(this.registry, path);
    if (!match || match.resource.singular !== resource) return false;
    try {
      authorizeRecordRead(this.registry, match, caller, this.enforceContext());
      return true;
    } catch (err) {
      if (err instanceof HttpError) return false;
      throw err;
    }
  }

  /** CORS headers for the request origin, when allowed. */
  private corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin');
    if (!origin || this.corsAllowedOrigins.length === 0) return {};
    for (const allowed of this.corsAllowedOrigins) {
      if (allowed === '*' || allowed === origin) {
        return {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Homestead-Client',
        };
      }
    }
    return {};
  }

  /** Auth exemptions, identical to the Go middleware. */
  private isAuthExempt(method: string, path: string): boolean {
    if (method === 'POST' && path === '/users/:login') return true;
    if (path.startsWith('/oauth/')) return true;
    if (method === 'GET' && path === '/openapi.json') return true;
    if (method === 'OPTIONS') return true;
    return false;
  }

  fetch = async (req: Request): Promise<Response> => {
    const cors = this.corsHeaders(req);
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    let res: Response;
    try {
      res = await this.handle(req);
    } catch (err) {
      if (err instanceof HttpError) {
        res = errorResponse(err.status, err.message);
      } else {
        // Unexpected (non-HttpError) failures were previously returned as a 500
        // but never logged — surface them so a 500 leaves a trace.
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`unhandled ${req.method} ${new URL(req.url).pathname}`, { err });
        res = errorResponse(500, msg);
      }
    }

    if (Object.keys(cors).length > 0) {
      res = new Response(res.body, res);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    }
    if (process.env.HOMESTEAD_DEBUG_HTTP && res.status >= 400) {
      log.info(`${req.method} ${new URL(req.url).pathname} → ${res.status}`);
    }
    return res;
  };

  private async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Authenticate (everything requires a bearer token except the exemptions).
    let caller: User | null = null;
    if (!this.isAuthExempt(req.method, path)) {
      const token = extractBearerToken(req);
      if (token === '') {
        return errorResponse(401, 'missing or invalid Authorization header');
      }
      caller = this.tokenValidator
        ? await this.tokenValidator(token)
        : getUserByToken(this.db, token);
      if (!caller) return errorResponse(401, 'invalid token');
      // Every authenticated path — both token validators, and the loopback
      // /users/me the API routes authenticate through — funnels through here,
      // so this is the one place a PAT's usage can be recorded.
      if (caller.pat) touchPatLastUsed(this.db, caller.pat.id);
    }

    // Post-commit observers (the change feed) read the writer from here.
    return runWithRequestContext({ caller, origin: originOf(req) }, () =>
      this.route(req, path, caller),
    );
  }

  private async route(req: Request, path: string, caller: User | null): Promise<Response> {
    const segments = path.split('/').filter((s) => s.length > 0);

    if (this.accessCheck) {
      const denied = this.accessCheck(req, segments, caller);
      if (denied) return denied;
    }

    if (req.method === 'GET' && path === '/openapi.json') {
      return new Response(JSON.stringify(buildOpenApi(this.registry), null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (segments[0] === 'aep-resource-definitions') {
      return this.routeMeta(req, segments, caller);
    }

    if (segments[0] === 'users' && segments.length <= 2) {
      return this.routeUsers(req, segments, caller, this.syncDispatcher);
    }

    if (segments[0] === 'oauth') {
      if (!this.oauth) return notFoundText();
      const res = await this.oauth.handle(req, segments, this.sessionIssuer);
      return res ?? notFoundText();
    }

    const dynamicRes = await routeDynamic(
      this.registry,
      req,
      segments,
      caller,
      this.enforceContext(),
    );
    if (dynamicRes) return dynamicRes;

    return notFoundText();
  }

  private async routeMeta(
    req: Request,
    segments: string[],
    caller: User | null,
  ): Promise<Response> {
    // Schema mutation (create/update/delete a resource definition) can drop
    // collections, rewrite field shapes, and toggle a resource's write
    // protection — it is an administrative operation, restricted to superusers.
    // Reads stay open to any authenticated caller: the SPA loads definitions to
    // render its data views. The boot schema-sync and `homestead resources` run
    // as the seeded superuser, so both keep working.
    const isMutation =
      (segments.length === 1 && req.method === 'POST') ||
      (segments.length === 2 && (req.method === 'PATCH' || req.method === 'DELETE'));
    if (isMutation && caller?.type !== TYPE_SUPERUSER) {
      return errorResponse(403, 'only superusers can modify resource definitions');
    }

    if (segments.length === 1) {
      if (req.method === 'POST') return handleMetaCreate(this.registry, req);
      if (req.method === 'GET') return handleMetaList(this.registry, req);
      return notFoundText();
    }
    if (segments.length === 2) {
      const id = decodeURIComponent(segments[1]!);
      if (req.method === 'GET') return handleMetaGet(this.registry, id);
      if (req.method === 'PATCH') return handleMetaUpdate(this.registry, req, id);
      if (req.method === 'DELETE') return handleMetaDelete(this.registry, id);
    }
    return notFoundText();
  }

  private async routeUsers(
    req: Request,
    segments: string[],
    caller: User | null,
    syncDispatcher: SyncDispatcher | null,
  ): Promise<Response> {
    if (segments.length === 1) {
      if (req.method === 'POST') return handleUserCreate(this.db, req, caller, syncDispatcher);
      if (req.method === 'GET') return handleUserList(this.db, req, caller);
      return notFoundText();
    }

    const raw = decodeURIComponent(segments[1]!);
    const colon = raw.indexOf(':');
    if (colon >= 0) {
      const verb = raw.slice(colon + 1);
      if (req.method === 'POST') {
        if (verb === 'login') return handleLogin(this.db, req);
        if (verb === 'logout') return handleLogout(this.db, req);
        return errorResponse(404, `unknown method "${verb}"`);
      }
      return errorResponse(404, `unknown GET method "${verb}"`);
    }

    switch (req.method) {
      case 'GET':
        return handleUserGet(this.db, raw, caller);
      case 'PATCH':
        return handleUserUpdate(this.db, req, raw, caller, syncDispatcher);
      case 'DELETE':
        return handleUserDelete(this.db, raw, caller, syncDispatcher);
      case 'POST':
        return errorResponse(405, 'POST not allowed on individual user resource');
      default:
        return notFoundText();
    }
  }
}
