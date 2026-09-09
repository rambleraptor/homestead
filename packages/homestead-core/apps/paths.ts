/**
 * App route paths.
 *
 * An app's URL prefix (`web.basePath`) is derived from its id rather than
 * declared: a top-level app lives at `/<id>` and a child app at
 * `<parent path>/<id>`. Ids are already unique across the registry, so
 * derived paths can't collide, nest correctly by construction, and an
 * author never has to think about them.
 *
 * `web.basePath` remains accepted as an explicit override for the rare app
 * whose id can't double as its URL — the Health app, whose `/health` is the
 * server's readiness probe, is the canonical case. The registry resolves every
 * app through {@link resolveAppPaths} at init, so anything read back from the
 * registry always carries a concrete `basePath`.
 *
 * Browser-safe: no fs or server imports here.
 */

import type { AppConfig } from './types';

/**
 * Top-level URL segments the server answers itself, before the SPA ever sees
 * the request. `homestead-server/src/options.ts` builds its `isServerPath`
 * matcher from this same list so the two can't drift.
 */
export const SERVER_OWNED_SEGMENTS: readonly string[] = [
  'api',
  'oauth',
  'oauth2',
  '.well-known',
  'health',
];

/**
 * Top-level URL segments the SPA routes itself (login, OAuth callback, the
 * authorization prompt) or that Vite emits assets under. An app can't live
 * at any of these either.
 */
export const SPA_OWNED_SEGMENTS: readonly string[] = ['login', 'auth', 'authorize', 'assets'];

/** Every first segment an app's base path may not use. */
export const RESERVED_ROUTE_SEGMENTS: readonly string[] = [
  ...SERVER_OWNED_SEGMENTS,
  ...SPA_OWNED_SEGMENTS,
];

/**
 * The shape an app id must have to double as a URL segment: lowercase
 * letters and digits, with single `-` or `_` separators. Uppercase, spaces,
 * and slashes would all produce a path the router can't match cleanly.
 */
const URL_SAFE_ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export function isUrlSafeAppId(id: string): boolean {
  return URL_SAFE_ID.test(id);
}

/** First path segment of a base path, e.g. `/games/minigolf` → `games`. */
export function firstSegment(basePath: string): string {
  return basePath.split('/').filter(Boolean)[0] ?? '';
}

/**
 * The base path an app resolves to: its explicit `web.basePath` when one is
 * declared, otherwise `/<id>` for a top-level app or `<parent>/<id>` for a
 * child. `parentBasePath` is the *resolved* path of the parent, so nesting
 * composes through any depth of children.
 */
export function deriveBasePath(app: AppConfig, parentBasePath?: string): string {
  if (app.web?.basePath) return app.web.basePath;
  const prefix = parentBasePath ? parentBasePath.replace(/\/+$/, '') : '';
  return `${prefix}/${app.id}`;
}

/**
 * Return a copy of the app tree in which every `web` config carries a
 * concrete `basePath`. Apps that already declare one are left as they are;
 * headless apps (no `web`) pass through untouched. The originals are never
 * mutated, so module-level config singletons stay pristine across registry
 * re-initializations (tests install synthetic registries repeatedly).
 */
export function resolveAppPaths(apps: AppConfig[], parentBasePath?: string): AppConfig[] {
  return apps.map((app) => {
    const basePath = app.web ? deriveBasePath(app, parentBasePath) : undefined;
    const children = app.children
      ? resolveAppPaths(app.children, basePath ?? parentBasePath)
      : undefined;
    const changed =
      (app.web && app.web.basePath !== basePath) || children !== undefined;
    if (!changed) return app;
    return {
      ...app,
      ...(app.web ? { web: { ...app.web, basePath } } : {}),
      ...(children ? { children } : {}),
    };
  });
}

/**
 * Read an app's base path. Apps that come out of the registry always carry
 * one (see {@link resolveAppPaths}); for a raw top-level config this falls
 * back to the derived `/<id>`. Callers must hand in an app with a `web`
 * section — a headless app has no path.
 */
export function appBasePath(app: AppConfig): string {
  return app.web?.basePath ?? `/${app.id}`;
}
