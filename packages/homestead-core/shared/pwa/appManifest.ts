/**
 * Per-app home-screen (PWA) manifest — the DOM-free half of the feature,
 * shared by the SPA (`homeScreenIcon.ts`, `useHomeScreenIcon`) and the server
 * (`GET /api/app-manifest/:id`, plus the index.html rewrite for app paths).
 *
 * The manifest is served from a real URL rather than embedded as a `data:`
 * URL because iOS does not reliably read a `data:` manifest — it fell back to
 * the site-wide one, whose `start_url` is `/`, so an app added to the Home
 * Screen launched on the dashboard instead of the app. For the same reason the
 * server writes the app's manifest link, touch icon and title straight into
 * the HTML it serves for an app path: WebKit may read the head before the SPA
 * has had a chance to swap it at runtime.
 */

import type { AppConfig } from '../../apps/types';

/** Brand color, kept in sync with `packages/homestead-app/index.html`. */
export const THEME_COLOR = '#F7F9FC';

/** The minimal app metadata needed to build a home-screen icon. */
export interface HomeScreenApp {
  /** App id → the manifest URL and the manifest `id`. */
  id: string;
  /** App display name → manifest name + iOS home-screen label. */
  name: string;
  /** App description (optional manifest field). */
  description?: string;
  /** Base path the installed app should launch to, e.g. `/groceries`. */
  basePath: string;
  /** URL/path to the app's square home-screen image. */
  iconHref: string;
}

/** Where the server serves an app's manifest. */
export function appManifestPath(appId: string): string {
  return `/api/app-manifest/${encodeURIComponent(appId)}`;
}

function guessImageType(href: string): string {
  const path = href.split(/[?#]/, 1)[0].toLowerCase();
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

/**
 * The web-app manifest for one app. `start_url` is the app's base path; the
 * scope is the whole origin so the login page, the OAuth callback and links
 * into other apps all stay inside the installed app instead of popping out
 * to a browser. Paths are root-relative — a manifest served from a real URL
 * resolves them against the origin.
 */
export function buildAppManifest(app: HomeScreenApp): Record<string, unknown> {
  const type = guessImageType(app.iconHref);
  return {
    id: app.basePath,
    name: app.name,
    short_name: app.name,
    ...(app.description ? { description: app.description } : {}),
    start_url: app.basePath,
    scope: '/',
    display: 'standalone',
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
    icons: [
      { src: app.iconHref, sizes: '192x192', type, purpose: 'any' },
      { src: app.iconHref, sizes: '512x512', type, purpose: 'any maskable' },
    ],
  };
}

/** The home-screen view of an app config, or null when it declares no icon. */
export function toHomeScreenApp(app: AppConfig): HomeScreenApp | null {
  if (!app.web?.homeScreenIcon) return null;
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    basePath: app.web.basePath,
    iconHref: app.web.homeScreenIcon,
  };
}

function walk(apps: AppConfig[]): AppConfig[] {
  return apps.flatMap((app) => [app, ...walk(app.children ?? [])]);
}

/** The app with this id, if it declares a home-screen icon. */
export function findHomeScreenAppById(apps: AppConfig[], id: string): HomeScreenApp | null {
  const found = walk(apps).find((app) => app.id === id);
  return found ? toHomeScreenApp(found) : null;
}

function ownsPath(basePath: string, pathname: string): boolean {
  const base = basePath.replace(/\/+$/, '');
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * The app whose base path owns `pathname` and that declares a home-screen
 * icon — the longest matching base path wins, so a child app
 * (`/games/minigolf`) beats its parent (`/games`).
 */
export function findHomeScreenApp(apps: AppConfig[], pathname: string): HomeScreenApp | null {
  let best: HomeScreenApp | null = null;
  for (const app of walk(apps)) {
    const hs = toHomeScreenApp(app);
    if (!hs || !ownsPath(hs.basePath, pathname)) continue;
    if (!best || hs.basePath.length > best.basePath.length) best = hs;
  }
  return best;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Rewrite one attribute on the first tag matching `tag`, recording the
 * previous value in `data-hs-default` so the SPA's `resetHomeScreenIcon` can
 * restore the site-wide default after a client-side navigation away from the
 * app. Leaves the HTML untouched when the tag or attribute is missing.
 */
function rewriteAttr(html: string, tag: RegExp, attr: string, value: string): string {
  const match = tag.exec(html);
  if (!match) return html;
  const original = match[0];
  const attrRe = new RegExp(`\\b${attr}="([^"]*)"`);
  const current = attrRe.exec(original);
  if (!current) return html;
  let rewritten = original.replace(attrRe, `${attr}="${escapeAttr(value)}"`);
  if (!/\bdata-hs-default=/.test(rewritten)) {
    rewritten = rewritten.replace(
      /\s*\/?>$/,
      (end) => ` data-hs-default="${escapeAttr(current[1])}"${end}`,
    );
  }
  return html.slice(0, match.index) + rewritten + html.slice(match.index + original.length);
}

/**
 * Point the served `index.html` at `app`'s manifest, touch icon and title, so
 * a browser that reads the head at load time (iOS) installs the app rather
 * than the site. Mirrors what `applyHomeScreenIcon` does at runtime.
 */
export function injectHomeScreenHead(html: string, app: HomeScreenApp): string {
  let out = html;
  out = rewriteAttr(out, /<link\b[^>]*\brel="manifest"[^>]*>/, 'href', appManifestPath(app.id));
  out = rewriteAttr(out, /<link\b[^>]*\brel="apple-touch-icon"[^>]*>/, 'href', app.iconHref);
  out = rewriteAttr(
    out,
    /<meta\b[^>]*\bname="apple-mobile-web-app-title"[^>]*>/,
    'content',
    app.name,
  );
  return out;
}
