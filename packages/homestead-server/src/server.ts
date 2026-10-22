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

import { createApp } from './app';
import type { Engine } from './engine/engine';
import { listen } from './listen';
import { log } from './log';
import { isServerPath, type ServerOptions } from './options';
import { serveStatic } from './static';

export interface RunningServer {
  publicPort: number;
  engine: Engine;
  stop: () => Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const app = await createApp({
    dev: opts.dev,
    dataDir: opts.dataDir,
    spa: opts.spa,
    origin: `http://127.0.0.1:${opts.publicPort}`,
  });
  const { engine, engineBase, spa, rewriteIndex, setupState } = app;

  let stopPublic: () => Promise<void> | void;
  if (opts.dev) {
    const { startDevServer } = await import('./dev-vite');
    const dev = await startDevServer({
      port: opts.publicPort,
      fetch: app.fetch,
      rewriteIndex,
    });
    stopPublic = dev.stop;
  } else {
    const server = await listen({
      port: opts.publicPort,
      fetch: (req) => {
        const path = new URL(req.url).pathname;
        if (isServerPath(path)) return app.fetch(req);
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
  const registry = await import('./app-registry');
  const { operationStore } = await import(
    '@rambleraptor/homestead-core/server/operations'
  );
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
      app.close();
    },
  };
}
