/**
 * Injection seam for the engine's link graph (`homestead-server/src/engine/links.ts`):
 * which records a resource links to, by the names `include` takes. Core can't
 * import the engine (the dependency direction is server → core), so the server
 * hands a resolver down at boot, like `setCollectionAccessResolver`.
 *
 * The model-facing tools read it to offer `include` on a resource, limited to
 * links whose target they offer too.
 */

export interface LinkInfo {
  /** What `include` names it by: `households`, `members`, `parent`. */
  name: string;
  /** The singular of the resource it leads to. */
  to: string;
  /** Whether it can lead to more than one record. */
  many: boolean;
}

export type LinkResolver = (singular: string) => LinkInfo[];

let resolver: LinkResolver | null = null;

/** Install the server's resolver. `null` removes it. */
export function setLinkResolver(next: LinkResolver | null): void {
  resolver = next;
}

/** A resource's links, or none when no resolver is installed. */
export function linksFor(singular: string): LinkInfo[] {
  return resolver ? resolver(singular) : [];
}
