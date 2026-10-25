/**
 * What one caller could do with each collection — the question a model-facing
 * tool surface asks before it offers a tool (`/api/chat`, `/api/mcp`).
 *
 * A tool the caller can't use costs tokens on every turn, earns a 403 when the
 * model tries it, and tells the model an app exists that the person can't see.
 * So each surface drops the collections a caller can't read and the write
 * actions on ones they can't write.
 *
 * The answer is "could *some* request succeed", never "will this one": the
 * router still decides every call. It follows the router's three access paths
 * (`accessPathFor`) and errs toward yes wherever a row would decide:
 *
 *  - **own** (top-level, `independent_access`) — a collection grant, a
 *    filtered one (taken to match), a record shared with the caller, or a row
 *    they own;
 *  - **inherited** — the same question of the governing ancestor, minus
 *    collection-wide denies on anything between it and this resource;
 *  - **user subtree** — always theirs; only the credential narrows it.
 *
 * On every path the credential ceiling applies exactly as in `./enforce`: a
 * read-only OAuth scope writes nothing, and a PAT reaches only what its own
 * grants reach (with no owner identity). `superuser_write` resources are
 * read-only to everyone else.
 */

import type { CollectionAccess } from '@rambleraptor/homestead-core/resources/model-tools';
import type { Database } from './sqlite';
import { OWNER_COLUMN, sanitizeTableName } from './db';
import {
  cappedByScope,
  tokenGrantsFor,
  tokenPrincipals,
  type EnforceContext,
} from './enforce';
import { governingResource } from './inherit';
import { resolve, type AccessRequest, type Grant, type Principals, type Verb } from './permissions';
import { USER_SINGULAR, type RegisteredResource, type Registry } from './registry';
import { TYPE_SUPERUSER, type User } from './types';

const CAP_RANK: Record<Verb, number> = { read: 1, write: 2, manage: 3 };

/** Grant rows answer to the manage-on-target rule, not to grants on themselves. */
const ACCESS_GRANT_SINGULAR = 'access-grant';

/** One side of a decision: the caller's own authority, or their token's. */
interface Side {
  principals: Principals;
  /** The side's grants, minus filtered denies (a filter narrows, never closes). */
  grants: Grant[];
  /** Whether the caller owns a row of this collection (owner side only). */
  owns: (r: RegisteredResource) => boolean;
}

/** {@link CollectionAccess} for every registered collection, by singular. */
export function collectionAccess(
  ctx: EnforceContext,
  db: Database,
  registry: Registry,
  caller: User,
): Map<string, CollectionAccess> {
  const gathered = ctx.store.gatherFor(caller.id);
  const isSuperuser = caller.type === TYPE_SUPERUSER;
  const usable = (grants: Grant[]): Grant[] =>
    grants.filter((g) => !(g.effect === 'deny' && g.target.filter));

  const owned = new Map<string, boolean>();
  const owner: Side = {
    principals: gathered.principals,
    grants: usable(gathered.grants),
    owns: (r) => {
      let found = owned.get(r.singular);
      if (found === undefined) owned.set(r.singular, (found = ownsRow(db, r, caller.id)));
      return found;
    },
  };
  const token: Side | null = caller.pat
    ? {
        principals: tokenPrincipals(caller.pat.id),
        grants: usable(tokenGrantsFor(gathered.grants, caller.pat.id)),
        owns: () => false, // a PAT draws nothing from who holds it
      }
    : null;

  const request = (r: RegisteredResource, verb: Verb): AccessRequest => ({
    verb,
    resourceType: r.singular,
    appId: ctx.appIdFor(r.plural),
  });

  /** Could some `verb` request on `r`'s own rows pass for `side`? */
  const reaches = (side: Side, r: RegisteredResource, verb: Verb): boolean => {
    const base = request(r, verb);
    // A filtered grant is taken to match: it governs which rows, and create.
    const allows = (req: AccessRequest): boolean =>
      resolve({ isSuperuser: false }, req, side.principals, side.grants, () => true).allow;
    if (allows(base)) return true;
    for (const g of side.grants) {
      if (
        g.effect === 'allow' &&
        g.target.scope === 'record' &&
        g.target.resource_type === r.singular &&
        CAP_RANK[g.capability] >= CAP_RANK[verb] &&
        allows({ ...base, recordId: g.target.resource_id })
      ) {
        return true;
      }
    }
    return side.owns(r) && allows({ ...base, recordOwner: side.principals.userId });
  };

  /** Whether a collection-wide deny on `r` blocks `verb` for `side`. */
  const deniedOutright = (side: Side, r: RegisteredResource, verb: Verb): boolean => {
    const broad = side.grants.filter((g) => g.effect === 'deny' && g.target.scope !== 'record');
    return resolve({ isSuperuser: false }, request(r, verb), side.principals, broad).reason === 'denied';
  };

  const can = (r: RegisteredResource, verb: Verb): boolean => {
    if (verb !== 'read' && cappedByScope(caller, verb)) return false;
    if (r.singular === ACCESS_GRANT_SINGULAR) return true;

    const chain = ancestors(registry, r);
    if (chain.some((a) => a.singular === USER_SINGULAR)) {
      // checkUserScope decides by path; only the credential ceiling is added.
      return !token || reaches(token, r, verb);
    }

    const governor = governingResource(registry, r);
    if (!governor) {
      return (isSuperuser || reaches(owner, r, verb)) && (!token || reaches(token, r, verb));
    }

    // Everything beneath the governor whose denies still apply.
    const beneath = [...chain.slice(0, chain.indexOf(governor)), r];
    const ownerOk =
      isSuperuser ||
      (reaches(owner, governor, verb) && !beneath.some((b) => deniedOutright(owner, b, verb)));
    const tokenOk =
      !token ||
      ((reaches(token, governor, verb) || reaches(token, r, verb)) &&
        !beneath.some((b) => deniedOutright(token, b, verb)));
    return ownerOk && tokenOk;
  };

  const out = new Map<string, CollectionAccess>();
  for (const r of registry.dynamic()) {
    const read = can(r, 'read');
    // Grant writes skip `superuser_write` for the manage-on-target rule
    // (`routeGrant`): anyone may share what they manage.
    const superuserOnly = r.superuserWrite && r.singular !== ACCESS_GRANT_SINGULAR;
    const write = read && (isSuperuser || !superuserOnly) && can(r, 'write');
    out.set(r.singular, { read, write });
  }
  return out;
}

/** `r`'s ancestors along `parents[0]`, nearest first (the path a URL nests under). */
function ancestors(registry: Registry, r: RegisteredResource): RegisteredResource[] {
  const chain: RegisteredResource[] = [];
  const seen = new Set<string>([r.singular]);
  let parent = r.parents[0];
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const next = registry.get(parent);
    if (!next) break;
    chain.push(next);
    parent = next.parents[0];
  }
  return chain;
}

/** Whether `userId` owns at least one row of `r` (`LIMIT 1` on the indexed `_owner`). */
function ownsRow(db: Database, r: RegisteredResource, userId: string): boolean {
  if (r.singleton) return false;
  try {
    const row = db
      .query(`SELECT 1 FROM ${sanitizeTableName(r.plural)} WHERE ${OWNER_COLUMN} = ? LIMIT 1`)
      .get(userId);
    return !!row;
  } catch {
    return false; // a table not created yet (mid-sync) has no rows
  }
}
