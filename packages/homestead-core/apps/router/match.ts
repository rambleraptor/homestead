import type { AppConfig, AppRoute } from '../types';
import { deriveBasePath } from '../paths';

export interface RouteEntry {
  app: AppConfig;
  route: AppRoute;
  /** Full URL path split into segments, e.g. ['gift-cards', 'import']. */
  segments: string[];
}

export interface RouteMatch {
  app: AppConfig;
  route: AppRoute;
  params: Record<string, string>;
}

/**
 * Flatten every app's routes into matchable entries. Base paths are derived
 * from ids (children under their parent's path) exactly as the registry
 * resolves them, so this works on raw configs as well as registered ones.
 */
export function buildRouteEntries(apps: AppConfig[]): RouteEntry[] {
  const out: RouteEntry[] = [];
  const visit = (mod: AppConfig, parentBasePath?: string): void => {
    const basePath = mod.web ? deriveBasePath(mod, parentBasePath) : parentBasePath;
    if (mod.web && basePath) {
      for (const route of mod.web.routes) {
        out.push({
          app: mod,
          route,
          segments: pathToSegments(joinPath(basePath, route.path)),
        });
      }
    }
    for (const child of mod.children ?? []) visit(child, basePath);
  };
  for (const mod of apps) visit(mod);
  return out;
}

export function matchRoute(
  slug: string[],
  entries: RouteEntry[],
): RouteMatch | null {
  const candidates = [...entries].sort(
    (a, b) => staticSegmentCount(b) - staticSegmentCount(a),
  );
  for (const entry of candidates) {
    const params = matchSegments(entry.segments, slug);
    if (params) {
      return { app: entry.app, route: entry.route, params };
    }
  }
  return null;
}

function joinPath(basePath: string, path: string): string {
  if (!path) return basePath;
  return `${basePath.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function pathToSegments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function paramName(seg: string): string | null {
  return seg.startsWith(':') ? seg.slice(1) : null;
}

function staticSegmentCount(entry: RouteEntry): number {
  return entry.segments.filter((s) => paramName(s) === null).length;
}

function matchSegments(
  pattern: string[],
  slug: string[],
): Record<string, string> | null {
  if (pattern.length !== slug.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const name = paramName(pattern[i]);
    if (name) {
      params[name] = slug[i];
    } else if (pattern[i] !== slug[i]) {
      return null;
    }
  }
  return params;
}
