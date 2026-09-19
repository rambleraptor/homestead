/**
 * homestead-server — the whole backend in one process (Bun, or Node ≥ 22.13
 * via tsx; see listen.ts / engine/sqlite.ts for the runtime seams).
 *
 * One listener, one process. Everything is served on the public port:
 * /api/aep/* (the custom-method gateway + the engine, the *only* way to reach
 * aepbase), /api/chat, /api/notifications, /api/custom-methods, /oauth/*, then
 * the SPA (Vite middleware in dev, static assets in prod). Same-box callers
 * (schema sync, server-side helpers, the `homestead resources` CLI) reach the
 * engine over loopback at the same /api/aep prefix — there is no separate
 * engine port.
 */

import { Hono } from 'hono';
import { join } from 'node:path';
import { Engine } from './engine/engine';
import { listen } from './listen';
import { log } from './log';
import { isServerPath, type ServerOptions } from './options';
import { diskSpaAssets, serveStatic } from './static';

export interface RunningServer {
  publicPort: number;
  engine: Engine;
  stop: () => Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  // Loopback origin for same-box callers (schema sync, server-side helpers,
  // the `homestead resources` CLI). The engine is reachable only under the
  // /api/aep prefix on the public port — there is no separate engine port.
  const loopbackOrigin = `http://127.0.0.1:${opts.publicPort}`;
  const engineBase = `${loopbackOrigin}/api/aep`;

  // homestead-core/server/aepbase reads AEPBASE_URL at import time, so it
  // must be set before any route module loads (they're imported lazily
  // below for exactly this reason).
  process.env.AEPBASE_URL = process.env.AEPBASE_URL || engineBase;

  // Importing the registry module initializes the app registry (side effect).
  const registry = await import('./app-registry');
  const { ensureSuperuser } = await import('./bootstrap');

  // Push the operator's AI config into core before any route handles a request
  // (core can't import the server's registry — the dependency direction is
  // server → core — so the server hands it down). null leaves AI disabled.
  const { setAiConfig, setEmbeddingConfig } = await import(
    '@rambleraptor/homestead-core/server/ai/config'
  );
  setAiConfig(registry.aiConfig());
  setEmbeddingConfig(registry.embeddingConfig());

  // Same hand-down for the operator's email config (null leaves email disabled,
  // so the documents ingestion cron no-ops).
  const { setEmailConfig } = await import(
    '@rambleraptor/homestead-core/server/email/config'
  );
  setEmailConfig(registry.emailConfig());

  // Vector store for semantic search over ai.embed file fields. Core can't open
  // a SQLite db itself (server → core dependency direction), so the server
  // constructs the store and hands it down, like the AI config above.
  const { createSqliteVectorStore } = await import('./vectors/sqlite-store');
  const { setVectorStore } = await import(
    '@rambleraptor/homestead-core/server/vectors/store'
  );
  const vectorStore = createSqliteVectorStore(join(opts.dataDir, 'vectors.db'));
  setVectorStore(vectorStore);

  const engine = new Engine({
    dbPath: join(opts.dataDir, 'aepbase.db'),
    filesDir: join(opts.dataDir, 'files'),
    serverUrl: engineBase,
    oauth: registry.oauthConfig(),
  });

  // App-level access is governed by the permission system, not a per-app gate.
  // The collection→app map still feeds permission enforcement so app-scope
  // grants can match.
  const accessMap = registry.appAccessMap();
  if (accessMap) {
    engine.setPermissionAppMap(accessMap.collectionToApp);
  }

  // The auth service owns the token lifecycle (expiry, refresh, revocation).
  // Wiring its validator into the engine makes every /api/aep request — and,
  // transitively, the custom-method gateway's authenticate() — honor token
  // expiry. Non-expiring mints (mintAdminToken, pre-existing tokens) keep
  // working: their _tokens.expires_at is NULL.
  const { AuthService } = await import('./auth/service');
  const authService = new AuthService(engine.db);
  engine.setTokenValidator(authService.validateAccessToken);
  // Federated (Google/GitHub) logins mint their session through the same
  // service, so an OAuth user gets access + refresh tokens exactly like a
  // password user. Without an issuer the engine falls back to a bare,
  // non-expiring token.
  engine.setSessionIssuer((userId) => authService.issueSession(userId));

  // Wire the post-commit resource-sync dispatcher. Built from the aggregated
  // app- and config-declared syncs, the engine's db, and the same shared
  // OperationStore the cron scheduler uses (so sync firings appear as operations
  // too). Set before the listener starts so writes are mirrored from the first
  // request. Like crons, this doesn't depend on the schema sync having finished.
  // Dispatch is fire-and-forget — a mirror never blocks or fails the write it
  // observes.
  const { createSyncDispatcher } = await import('./sync');
  const { operationStore } = await import(
    '@rambleraptor/homestead-core/server/operations'
  );
  const resourceSyncs = registry.getAllResourceSyncs();

  // Fail fast if a sync names a resource that doesn't exist (a typo, or an app
  // that isn't installed) — otherwise it would silently never fire. Validate
  // against the full declared universe: the static definition lists plus the
  // built-in `user` root and the two dynamically-synced engine-managed
  // resources (`user-preference`, `app-flag`), which aren't in those lists.
  const { validateSyncResources } = await import(
    '@rambleraptor/homestead-core/resources/translate'
  );
  const { BUILTIN_RESOURCE_DEFS } = await import(
    '@rambleraptor/homestead-core/resources/builtins'
  );
  const { PERMISSION_RESOURCE_DEFS } = await import(
    '@rambleraptor/homestead-core/permissions/resources'
  );
  validateSyncResources(
    [
      'user',
      'user-preference',
      'app-flag',
      ...BUILTIN_RESOURCE_DEFS.map((d) => d.singular),
      ...PERMISSION_RESOURCE_DEFS.map((d) => d.singular),
      ...registry.getAllResourceDefs().map((d) => d.singular),
    ],
    resourceSyncs,
  );

  engine.setSyncDispatcher(
    createSyncDispatcher(engine.db, resourceSyncs, operationStore),
  );

  // Homestead-as-OAuth-provider (authorization server). Opt-in via
  // auth.authServer.enabled. When on, create its tables up front.
  const authServerCfg = registry.authServerConfig();
  if (authServerCfg?.enabled) {
    const { createOAuthTables } = await import('./auth/oauth/storage');
    createOAuthTables(engine.db);
  }

  const setupState = await ensureSuperuser(engine.db);

  // --- public app ---
  const { customMethodsResponse } = await import('./routes/custom-methods');
  const { makeAepGateway } = await import('./routes/aep-gateway');
  const { chatRoute } = await import('./routes/chat');
  const { notificationsRoute } = await import('./routes/notifications');
  const { makePermissionsRoute } = await import('./routes/permissions');
  const { makeTokensRoute } = await import('./routes/tokens');
  const { makeSecurityRoute } = await import('./routes/security');
  const { makeSetupRoute } = await import('./routes/setup');
  const { bulkImportTemplateRoute } = await import('./routes/bulk-import-template');
  const { makeAuthRoutes } = await import('./routes/auth');

  // In prod the SPA is served from disk; resolve it up front so /api/app-version
  // can report its current output hash. Dev serves via Vite middleware (no hash).
  const spa = opts.dev ? null : (opts.spa ?? diskSpaAssets());

  const { makeHealthRoute } = await import('./routes/health');
  const { makeAppManifestRoute } = await import('./routes/app-manifest');
  const { findHomeScreenApp, injectHomeScreenHead } = await import(
    '@rambleraptor/homestead-core/shared/pwa/appManifest'
  );
  // Requests for an app's path get that app's manifest, touch icon and title
  // written into the served index.html, so an "Add to Home Screen" from a
  // fresh load installs the app (iOS reads the head before the SPA runs).
  const rewriteIndex = (html: string, path: string): string => {
    const app = findHomeScreenApp(registry.getAllApps(), path);
    return app ? injectHomeScreenHead(html, app) : html;
  };

  const publicApp = new Hono();
  // Readiness check (probes the DB) — see routes/health.ts.
  publicApp.route('/health', makeHealthRoute(engine.db));
  // Open tabs poll this and reload when the served SPA build changes. The hash
  // is derived from the served index.html, so a `vite build --watch` rebuild
  // bumps it with no server restart; dev returns '' to disable the check.
  publicApp.get('/api/app-version', (c) => c.json({ buildId: spa?.version() ?? '' }));
  publicApp.get('/api/custom-methods', () => customMethodsResponse());
  // Per-app web-app manifests for "Add to Home Screen" (see routes/app-manifest.ts).
  publicApp.route('/api/app-manifest', makeAppManifestRoute(() => registry.getAllApps()));
  publicApp.route('/api/bulk-import', bulkImportTemplateRoute);
  publicApp.route('/api/setup', makeSetupRoute(engine.db));
  publicApp.route('/api/auth', makeAuthRoutes(engine.db, authService));
  publicApp.route('/api/notifications', notificationsRoute);
  publicApp.route('/api/permissions', makePermissionsRoute(engine));
  publicApp.route('/api/tokens', makeTokensRoute(engine));
  publicApp.route('/api/security', makeSecurityRoute());
  publicApp.route('/api/chat', chatRoute);
  publicApp.route('/api/aep', makeAepGateway(engine, loopbackOrigin));
  // OAuth login redirects (Homestead as client) arrive on the public origin;
  // the engine serves them.
  publicApp.all('/oauth/*', (c) => engine.fetch(c.req.raw));

  // OAuth authorization server (Homestead as provider): discovery metadata +
  // the /oauth2 endpoints. Only mounted when configured.
  if (authServerCfg?.enabled) {
    const { makeWellKnownRoutes } = await import('./auth/oauth/metadata');
    const { makeOAuthServerRoutes } = await import('./auth/oauth/routes');
    const { makeConnectionsRoute } = await import('./routes/connections');
    publicApp.route('/.well-known', makeWellKnownRoutes(authServerCfg));
    publicApp.route('/oauth2', makeOAuthServerRoutes(engine.db, authService, authServerCfg));
    // Connected-apps management (list + disconnect the clients authorized above).
    publicApp.route('/api/connections', makeConnectionsRoute(engine));
    // First-party MCP server. Authorizes through the AS above, so it's on by
    // default when the AS is enabled (opt out with auth.authServer.mcpEnabled).
    if (authServerCfg.mcpEnabled !== false) {
      const { makeMcpRoute } = await import('./routes/mcp');
      const { BUILTIN_RESOURCE_DEFS } = await import(
        '@rambleraptor/homestead-core/resources/builtins'
      );
      publicApp.route(
        '/api/mcp',
        makeMcpRoute(engine, authServerCfg, () => [
          ...BUILTIN_RESOURCE_DEFS,
          ...registry.getAllResourceDefs(),
        ]),
      );
    }
  }

  let stopPublic: () => Promise<void> | void;
  if (opts.dev) {
    const { startDevServer } = await import('./dev-vite');
    const dev = await startDevServer({
      port: opts.publicPort,
      fetch: publicApp.fetch,
      rewriteIndex,
    });
    stopPublic = dev.stop;
  } else {
    const server = await listen({
      port: opts.publicPort,
      fetch: (req) => {
        const path = new URL(req.url).pathname;
        if (isServerPath(path)) return publicApp.fetch(req);
        return serveStatic(spa!, path, rewriteIndex);
      },
    });
    stopPublic = server.stop;
  }

  // Apply app-declared schema in the background; serving doesn't depend on
  // it (the sync is idempotent and best-effort).
  void (async () => {
    const { syncSchema } = await import('./schema-sync');
    await syncSchema(engine.db, engineBase);
  })();

  // Start the app-declared cron hooks. Each firing mints its own short-lived
  // admin token and runs inside an AEP-151 operation (built-in per-run
  // logging), so this doesn't depend on the schema sync above having finished;
  // interval-based hooks fire well after boot regardless.
  const { startCronScheduler } = await import('./cron');
  // `operationStore` is imported above for the sync dispatcher; reuse it here.
  const cron = startCronScheduler(
    engine.db,
    registry.getAllCronHooks(),
    operationStore,
  );

  log.info('listening', {
    port: opts.publicPort,
    mode: opts.dev ? 'dev (vite middleware)' : 'prod',
  });
  if (setupState === 'pending') {
    log.warn('no admin account yet — open the app to create one', {
      url: `http://localhost:${opts.publicPort}`,
    });
  }

  return {
    publicPort: opts.publicPort,
    engine,
    stop: async () => {
      cron.stop();
      await stopPublic();
      engine.db.close();
      vectorStore.close();
    },
  };
}
