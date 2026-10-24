/**
 * Parent access inheritance: a child resource is reachable by whoever may reach
 * its parent.
 *
 * Every parented resource inherits by default. A request on one walks up its
 * parent chain to the **governing ancestor** — the first ancestor that does not
 * itself inherit — and that ancestor's record decides access:
 *
 *   gift-cards/g1/transactions/t1     → governed by gift-cards/g1
 *   credit-cards/c1/perks/p1/redemptions/r1 → governed by credit-cards/c1
 *   users/u1/notifications/n1         → governed by the user root, users/u1
 *
 * The user root is the case the engine always had: a record under a user is
 * reachable only by that user (and superusers), enforced by `checkUserScope` on
 * the path. Users are not grant-governed — you cannot share your user record —
 * so the root keeps that rule and inheritance generalizes it to every other
 * parent, whose access *is* grant-governed.
 *
 * A resource opts out with `independent_access` on its definition. Its rows are
 * then authorized on their own `_owner` and grants, as every resource was
 * before inheritance, and it becomes a governing ancestor for its own children.
 *
 * See `packages/homestead-site/docs/design/parent-access-inheritance.md`.
 */

import { buildResourcePath } from './crud';
import { USER_SINGULAR, type RegisteredResource, type Registry } from './registry';

/** One ancestor record of a request, addressed from the request path. */
export interface AncestorRecord {
  resource: RegisteredResource;
  /** The record's id, taken from the request path. */
  id: string;
  /** The record's AEP path, e.g. `gift-cards/g1`. */
  path: string;
}

/** The ancestor record that decides access to a child request. */
export interface Governor extends AncestorRecord {
  /**
   * The inheriting ancestors between the governor and the addressed resource,
   * nearest the governor first — e.g. the perk on a redemption request, which
   * is governed by the credit card. They grant nothing (the governor does), but
   * a deny on one of them still covers everything beneath it.
   */
  intermediates: AncestorRecord[];
}

function paramName(singular: string): string {
  return `${singular.replaceAll('-', '_')}_id`;
}

/** True when `r` takes its access from its parent rather than its own rows. */
export function inheritsAccess(r: RegisteredResource): boolean {
  return r.parents.length > 0 && !r.independentAccess;
}

/**
 * The resource that governs `r`'s access, or null when `r` governs itself (no
 * parent, or `independent_access`). Follows `parents[0]` — the parent the URL
 * pattern nests under — so the governor is always addressable from the path.
 */
export function governingResource(
  reg: Registry,
  r: RegisteredResource,
): RegisteredResource | null {
  if (!inheritsAccess(r)) return null;
  let current = r;
  // Bounded by the registry size: parents are validated to exist and the
  // schema sync topologically sorts them, so a cycle cannot register — the
  // bound is belt and braces against a hand-written definition table.
  const maxHops = reg.all().length;
  for (let hops = 0; hops <= maxHops; hops++) {
    const parent = reg.get(current.parents[0]!);
    if (!parent) return null;
    if (parent.singular === USER_SINGULAR || !inheritsAccess(parent)) return parent;
    current = parent;
  }
  return null;
}

/**
 * The governing ancestor *record* for a request on `r`, resolved from the
 * request's path params. Null when `r` governs itself.
 */
export function governorFor(
  reg: Registry,
  r: RegisteredResource,
  parentIds: Record<string, string>,
): Governor | null {
  const resource = governingResource(reg, r);
  if (!resource) return null;
  const record = (res: RegisteredResource): AncestorRecord => {
    const id = parentIds[paramName(res.singular)] ?? '';
    const path =
      res.singular === USER_SINGULAR ? `users/${id}` : buildResourcePath(res, parentIds, id);
    return { resource: res, id, path };
  };

  // Walk from the direct parent up to (not including) the governor.
  const intermediates: AncestorRecord[] = [];
  let current = reg.get(r.parents[0]!);
  while (current && current !== resource) {
    intermediates.unshift(record(current));
    current = reg.get(current.parents[0]!);
  }
  return { ...record(resource), intermediates };
}
