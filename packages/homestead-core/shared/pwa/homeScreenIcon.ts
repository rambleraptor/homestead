/**
 * Per-app home-screen (PWA) icon support — the runtime half.
 *
 * The SPA ships a single static manifest + `apple-touch-icon` (the Homestead
 * brand). To let an individual app own its home-screen icon, we mutate the
 * document head when the user navigates into that app:
 *
 *   - `<link rel="apple-touch-icon">` → the app's icon (iOS "Add to Home
 *     Screen" reads this directly).
 *   - `<link rel="manifest">` → the app's manifest, served by the server at
 *     `/api/app-manifest/<id>` (see `appManifest.ts`) with the app's name,
 *     start path and icon (Chrome/Android install, iOS start URL).
 *   - `<meta name="apple-mobile-web-app-title">` → the app's name (the iOS
 *     home-screen label).
 *
 * The server already writes these into the HTML it serves for an app path
 * (`injectHomeScreenHead`), so on a direct load the head is right before any
 * JavaScript runs; this module keeps it right across client-side navigation.
 *
 * The first time we touch each element we stash its original value in a
 * `data-hs-default` attribute (the server's rewrite pre-populates it), so
 * `resetHomeScreenIcon` can faithfully restore the global Homestead defaults —
 * no app-level mutable state, which keeps the behavior self-contained and
 * easy to test.
 */

import { appManifestPath, type HomeScreenApp } from './appManifest';

export type { HomeScreenApp } from './appManifest';

const DEFAULT_APPLE_TOUCH_ICON = '/apple-touch-icon.png';
const DEFAULT_MANIFEST = '/manifest.webmanifest';
const DEFAULT_APP_TITLE = 'Homestead';

function ensureLink(doc: Document, rel: string): HTMLLinkElement {
  let link = doc.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = doc.createElement('link');
    link.setAttribute('rel', rel);
    doc.head.appendChild(link);
  }
  return link;
}

function ensureMeta(doc: Document, name: string): HTMLMetaElement {
  let meta = doc.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = doc.createElement('meta');
    meta.setAttribute('name', name);
    doc.head.appendChild(meta);
  }
  return meta;
}

/** Record the element's current attribute value once, before we overwrite it. */
function stashDefault(el: Element, attr: string, fallback: string): void {
  if (!el.hasAttribute('data-hs-default')) {
    el.setAttribute('data-hs-default', el.getAttribute(attr) ?? fallback);
  }
}

/**
 * Point the document's home-screen metadata at `app`. Idempotent and
 * reversible via {@link resetHomeScreenIcon}.
 */
export function applyHomeScreenIcon(doc: Document, app: HomeScreenApp): void {
  const appleIcon = ensureLink(doc, 'apple-touch-icon');
  stashDefault(appleIcon, 'href', DEFAULT_APPLE_TOUCH_ICON);
  appleIcon.setAttribute('href', app.iconHref);

  const manifest = ensureLink(doc, 'manifest');
  stashDefault(manifest, 'href', DEFAULT_MANIFEST);
  manifest.setAttribute('href', appManifestPath(app.id));

  const title = ensureMeta(doc, 'apple-mobile-web-app-title');
  stashDefault(title, 'content', DEFAULT_APP_TITLE);
  title.setAttribute('content', app.name);
}

/** Restore the global Homestead home-screen icon, name and manifest. */
export function resetHomeScreenIcon(doc: Document): void {
  const appleIcon = doc.head.querySelector<HTMLLinkElement>(
    'link[rel="apple-touch-icon"]',
  );
  if (appleIcon) {
    appleIcon.setAttribute(
      'href',
      appleIcon.getAttribute('data-hs-default') ?? DEFAULT_APPLE_TOUCH_ICON,
    );
  }

  const manifest = doc.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) {
    manifest.setAttribute(
      'href',
      manifest.getAttribute('data-hs-default') ?? DEFAULT_MANIFEST,
    );
  }

  const title = doc.head.querySelector<HTMLMetaElement>(
    'meta[name="apple-mobile-web-app-title"]',
  );
  if (title) {
    title.setAttribute(
      'content',
      title.getAttribute('data-hs-default') ?? DEFAULT_APP_TITLE,
    );
  }
}
