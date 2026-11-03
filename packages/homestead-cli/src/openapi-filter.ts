import type { OpenAPI } from '@aep_dev/aep-lib-ts';

/**
 * The document minus collection-level custom methods (`/<plural>:<verb>`,
 * `/users/{user_id}/notifications:send`). aep-lib-ts models custom methods on
 * a single resource only and reads a collection-level POST as a malformed
 * create, failing the whole parse. The CLI takes its custom methods from
 * `/api/custom-methods` anyway, so nothing is lost.
 */
export function withoutCollectionMethods(openapi: OpenAPI): OpenAPI {
  const paths: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(openapi.paths ?? {})) {
    const [resourcePath, verb] = path.split(':', 2);
    // A collection path has an odd number of segments: plural, or parent pairs + plural.
    const collectionMethod = verb !== undefined && resourcePath!.split('/').slice(1).length % 2 === 1;
    if (!collectionMethod) paths[path] = item;
  }
  return { ...openapi, paths } as OpenAPI;
}
