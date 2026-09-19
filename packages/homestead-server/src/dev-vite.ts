/**
 * Dev-mode HTTP front: one `node:http` server on the public port that sends
 * server-owned paths (/api, /oauth, /health) to the Hono app and everything
 * else to Vite's middleware stack (SPA + HMR).
 *
 * Vite runs in middleware mode inside this same server process; its HMR
 * websocket upgrades on the same listener (`hmr: { server }`), so dev is a
 * single process on a single port. Prod never imports this module — the SPA
 * is served as static assets via listen.ts.
 *
 * The node→fetch bridge lives in node-http.ts (shared with the Node
 * production listeners).
 */

import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { bridge, type FetchHandler } from './node-http';
import { createLogger } from './log';
import { isServerPath } from './options';
import type { IndexRewrite } from './static';

const log = createLogger('dev-front');

const APP_ROOT = fileURLToPath(new URL('../../homestead-app', import.meta.url));

export interface DevServer {
  stop: () => Promise<void>;
}

export async function startDevServer(opts: {
  port: number;
  fetch: FetchHandler;
  /** Same hook prod's `serveStatic` applies to the index.html fallback. */
  rewriteIndex?: IndexRewrite;
}): Promise<DevServer> {
  const { createServer: createViteServer } = await import('vite');

  // The handler needs the Vite instance and Vite's HMR needs the http server,
  // so create the listener-less server first and attach `request` after.
  const httpServer = createHttpServer();
  // Never close idle keep-alive connections: the default 5s idle timeout
  // races browsers re-using a connection at the exact moment the server
  // closes it, which surfaces as transient "Failed to fetch" errors. Dev
  // serves one household; holding sockets open is free.
  httpServer.keepAliveTimeout = 0;

  const vite = await createViteServer({
    root: APP_ROOT,
    configFile: `${APP_ROOT}/vite.config.ts`,
    // 'custom' rather than 'spa': Vite still serves modules, assets and HMR,
    // but leaves the index.html fallback to us so the served head can be
    // rewritten per path exactly as prod's `serveStatic` does.
    appType: 'custom',
    server: {
      middlewareMode: true,
      // Same-port websocket upgrades for HMR.
      hmr: { server: httpServer },
    },
  });

  // SPA fallback: index.html run through Vite's HTML transforms (script
  // injection, HMR client) and then the same per-path rewrite as prod.
  const serveIndex = async (url: string, path: string): Promise<string> => {
    const raw = await readFile(`${APP_ROOT}/index.html`, 'utf8');
    const html = await vite.transformIndexHtml(url, raw);
    return opts.rewriteIndex ? opts.rewriteIndex(html, path) : html;
  };

  if (process.env.HOMESTEAD_DEBUG_HTTP) {
    httpServer.on('clientError', (err, socket) => {
      log.info('clientError', { err: err.message });
      socket.destroy();
    });
    httpServer.on('connection', (socket) => {
      socket.on('error', (err) => log.info('socket error', { err: err.message }));
    });
  }

  httpServer.on('request', (req, res) => {
    const path = (req.url ?? '/').split('?', 1)[0]!;
    if (process.env.HOMESTEAD_DEBUG_HTTP) {
      res.on('error', (err) => log.info('res error', { path, err: err.message }));
      res.on('close', () => {
        if (!res.writableFinished) {
          log.info('res closed unfinished', { method: req.method, path });
        }
      });
    }
    if (isServerPath(path)) {
      void bridge(req, res, opts.fetch).catch((err) => {
        log.error('bridge error', { method: req.method, path, err });
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return;
    }
    vite.middlewares(req, res, () => {
      serveIndex(req.url ?? '/', path)
        .then((html) => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(html);
        })
        .catch((err: unknown) => {
          if (err instanceof Error) vite.ssrFixStacktrace(err);
          log.error('index.html failed', { path, err });
          if (!res.headersSent) res.writeHead(500);
          res.end('index.html failed');
        });
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, () => resolve());
  });

  return {
    stop: async () => {
      await vite.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
