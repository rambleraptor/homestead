import type { HomeModule, ModuleRoute } from '../types';

export interface RouteEntry {
  module: HomeModule;
  route: ModuleRoute;
  /** Full URL path split into segments, e.g. ['gift-cards', 'import']. */
  segments: string[];
}

export interface RouteMatch {
  module: HomeModule;
  route: ModuleRoute;
  params: Record<string, string>;
}

export function buildRouteEntries(modules: HomeModule[]): RouteEntry[] {
  const out: RouteEntry[] = [];
  const visit = (mod: HomeModule): void => {
    for (const route of mod.routes) {
      out.push({
        module: mod,
        route,
        segments: pathToSegments(joinPath(mod.basePath, route.path)),
      });
    }
    for (const child of mod.children ?? []) visit(child);
  };
  for (const mod of modules) visit(mod);
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
      return { module: entry.module, route: entry.route, params };
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
