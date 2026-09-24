/**
 * Rasterize each app's home-screen (PWA) icon from its Lucide nav icon.
 *
 * Boots the same registry the SPA does (`homestead.config.ts` plus the
 * always-installed core apps) and, for every app whose `web.homeScreenIcon`
 * points under `/app-icons/`, writes a 512×512 PNG to `public/app-icons/`:
 * the app's `web.icon` glyph in white on a per-app background color. Deriving
 * the glyph from the config means the home-screen icon can never drift from
 * the icon the user sees in the sidebar.
 *
 * The PNGs are committed; this script is how they are (re)generated. Run it
 * after adding an app, changing an app's `web.icon`, or picking a new color:
 *
 *   cd packages/homestead-app && npm run icons:apps
 *
 * Output is full-bleed (no rounded corners or transparency) on purpose: iOS
 * applies its own mask to `apple-touch-icon`, and the generated manifest
 * declares the 512px image as `maskable`, so the glyph is kept inside the
 * maskable safe zone (the inner 80% circle) and the platform rounds the rest.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { withAlwaysInstalled } from '@rambleraptor/homestead-core/apps/core-apps';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import config from '../../../homestead.config';

const SIZE = 512;
/** Glyph box: 144px of padding keeps it inside the maskable safe zone. */
const GLYPH = 288;
const GLYPH_OFFSET = (SIZE - GLYPH) / 2;
const GLYPH_STROKE = 1.75;

/** Homestead brand indigo (`public/icon-512.svg`), for apps not listed below. */
const DEFAULT_COLOR = '#4F46E5';

/**
 * Background color per app id. Distinct hues so a phone's home screen can tell
 * the apps apart at a glance; all dark enough for a white glyph.
 */
const COLORS: Record<string, string> = {
  home: '#0F766E',
  todos: '#2563EB',
  documents: '#475569',
  'gift-cards': '#DB2777',
  groceries: '#16A34A',
  recipes: '#EA580C',
  people: '#7C3AED',
  events: '#E11D48',
  receipts: '#B45309',
  'credit-cards': '#0891B2',
  games: '#9333EA',
  minigolf: '#15803D',
  pictionary: '#C026D3',
  bridge: '#1D4ED8',
  health: '#DC2626',
  devices: '#65A30D',
  chat: '#0D9488',
  notifications: '#D97706',
  settings: '#52525B',
};

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const ICON_PREFIX = '/app-icons/';

function walk(apps: AppConfig[]): AppConfig[] {
  return apps.flatMap((app) => [app, ...walk(app.children ?? [])]);
}

/** The app's nav icon as SVG markup, positioned inside the 512px canvas. */
async function glyphMarkup(app: AppConfig): Promise<string> {
  const Icon = await app.web!.icon();
  const svg = renderToStaticMarkup(
    createElement(Icon, { size: GLYPH, strokeWidth: GLYPH_STROKE, color: '#FFFFFF' }),
  );
  // Nesting the rendered <svg> as-is keeps Lucide's own viewBox/stroke setup;
  // x/y place it on the canvas.
  return svg.replace('<svg ', `<svg x="${GLYPH_OFFSET}" y="${GLYPH_OFFSET}" `);
}

async function iconSvg(app: AppConfig): Promise<string> {
  const color = COLORS[app.id] ?? DEFAULT_COLOR;
  const glyph = await glyphMarkup(app);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.16"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${color}"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#sheen)"/>
  ${glyph}
</svg>
`;
}

async function main(): Promise<void> {
  const apps = walk(withAlwaysInstalled(config.apps ?? []));
  const outDir = join(PUBLIC_DIR, 'app-icons');
  mkdirSync(outDir, { recursive: true });

  let written = 0;
  for (const app of apps) {
    const href = app.web?.homeScreenIcon;
    if (!href) continue;
    if (!href.startsWith(ICON_PREFIX) || !href.endsWith('.png')) {
      console.log(`skip ${app.id}: ${href} is not a generated /app-icons/*.png`);
      continue;
    }
    if (!(app.id in COLORS)) {
      console.log(`note ${app.id}: no color listed, using the brand default`);
    }
    const file = basename(href);
    const png = await sharp(Buffer.from(await iconSvg(app)))
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(join(outDir, file), png);
    written += 1;
    console.log(`wrote ${join('public', 'app-icons', file)} (${app.name})`);
  }
  console.log(`${written} icon(s) written`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
