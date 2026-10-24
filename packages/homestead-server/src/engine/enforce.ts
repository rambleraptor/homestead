/**
 * Permission enforcement wiring (design §5.3). Bridges the request path to the
 * pure resolver: gathers the caller's grants from the PermissionStore, decides,
 * and either throws 403 or — for LIST — produces a SQL visibility clause.
 *
 * Enforcement is unconditional and fail-closed (no baseline → a grant-less
 * caller sees only their own rows). The router skips calling in here only for
 * user-parented resources, where `checkUserScope` (subtree ownership by path)
 * is the governing gate and grant/owner visibility would wrongly hide a record
 * created for the user by someone else.
 */

import type { Database } from './sqlite';
import { createLogger } from '../log';
import { HttpError } from './errors';
import { OWNER_COLUMN, sanitizeTableName } from './db';
import { compileFilter, type FilterSubject } from './filter';
import { TYPE_SUPERUSER, type Schema, type User } from './types';
import type { PermissionStore } from './permission-store';
import { scopeAllowsWrite } from '../auth/scopes';
import type { Registry } from './registry';
import { governingResource } from './inherit';
import {
  computeVisibility,
  resolve,
  type AccessRequest,
  type FilterEval,
  type Grant,
  type Principals,
  type Verb,
  type Visibility,
} from './permissions';

const log = createLogger('permissions');

/** Caller attributes exposed to a grant filter as `subject.*` (§3.6.1). */
function subjectOf(caller: User): FilterSubject {
  return { id: caller.id, email: caller.email, display_name: caller.display_name };
}

/**
 * A sentinel user id used as the *token-side* principal when a caller acts
 * through a personal access token. It matches no real user id and no row's
 * `_owner`, so the token pass draws its authority purely from grants addressed
 * to the token — the owner's own identity (direct grants, group roles,
 * owner⇒manage, the owner-rows LIST fast-path) never leaks in. Empty string is
 * never a valid id (ids are hex timestamps).
 */
const TOKEN_SENTINEL_USER = '';

/** The grants a PAT itself carries: only those addressed to this token id. */
export function tokenGrantsFor(grants: Grant[], patId: string): Grant[] {
  return grants.filter((g) => g.subject.type === 'token' && g.subject.id === patId);
}

/** Token-side principals: the token is the sole principal (see TOKEN_SENTINEL_USER). */
export function tokenPrincipals(patId: string): Principals {
  return { userId: TOKEN_SENTINEL_USER, groupIds: new Set(), tokenId: patId };
}

export interface EnforceContext {
  store: PermissionStore;
  /** Collection plural → owning app id (for app-scope grant matching). */
  appIdFor: (plural: string) => string | null;
}

function ownerOf(db: Database, plural: string, path: string): string | null {
  try {
    const row = db
      .query(`SELECT ${OWNER_COLUMN} AS owner FROM ${sanitizeTableName(plural)} WHERE path = ?`)
      .get(path) as { owner: string | null } | null;
    return row?.owner ?? null;
  } catch {
    return null;
  }
}

/**
 * Authorize a single-record or create/singleton request. `recordPath` is set
 * for ops that address an existing row (so we can read its owner); omit it for
 * create. Throws 403 when denied.
 */
export function enforceRecordAccess(
  ctx: EnforceContext,
  db: Database,
  opts: {
    caller: User | null;
    verb: Verb;
    resourceType: string;
    plural: string;
    schema: Schema;
    recordId?: string;
    recordPath?: string;
  },
): void {
  const { caller } = opts;
  if (!caller) return; // no auth context (unit tests); auth middleware enforces presence

  const gathered = ctx.store.gatherFor(caller.id);
  const { principals } = gathered;
  // The access model restricts *row* access (recordPath set); CREATE keeps the
  // full grant set so people can add records they'll own.
  const { grants } = gathered;
  const recordOwner = opts.recordPath ? ownerOf(db, opts.plural, opts.recordPath) : undefined;

  // A collection-scope grant filter (§3.6) matches iff the addressed record
  // satisfies it — evaluated as a SQL guard so it can't drift from LIST.
  //
  // On CREATE there is no row to match yet, and the filter describes *which
  // rows you may see and change*, not *whether you may add one*. So a filtered
  // grant authorizes creating in its collection: that's what lets a household
  // member add a document to a collection whose rows stay private to their
  // owner. (A filter naming other rows, e.g. `status == "draft"`, therefore
  // also permits creating a row outside it — the creator owns that row via
  // `_owner`, and the filter still governs everything they do to it after.)
  const filterEval: FilterEval = (filter) => {
    if (!opts.recordPath) return true; // create: no row yet — see above
    return recordMatchesFilter(db, opts.plural, opts.recordPath, filter, opts.schema, subjectOf(caller));
  };

  const request: AccessRequest = {
    verb: opts.verb,
    resourceType: opts.resourceType,
    appId: ctx.appIdFor(opts.plural),
    recordId: opts.recordId,
    recordOwner,
  };

  // Owner-side decision: the caller's full authority (superuser, group roles,
  // owner⇒manage). For an attenuated credential this is the *ceiling* — the
  // credential can never exceed what its owner may still do.
  const decision = resolve(
    { isSuperuser: caller.type === TYPE_SUPERUSER },
    request,
    principals,
    grants,
    filterEval,
  );
  if (!decision.allow) throw new HttpError(403, 'you do not have access to this resource');

  // …and then whatever the credential itself narrows that down to.
  applyCredentialCeiling(caller, request, () => gathered.grants, filterEval);
}

/**
 * The ceiling the *credential* imposes, independent of who owns it.
 *
 * Two credential kinds attenuate their owner's authority, and both are applied
 * here so there is exactly one place that knows how:
 *
 *  - **OAuth access tokens** carry a scope. A read-only scope caps the verbs
 *    the credential may exercise, no matter what its owner could do. Filtering
 *    the MCP tool list to match (`routes/mcp.ts`) is a courtesy to the client;
 *    this is the boundary, because the same token is a valid bearer at every
 *    other door too.
 *  - **Personal access tokens** carry grants of their own. Authority is the
 *    intersection of those grants with the owner's, resolved with no superuser
 *    bypass and no owner identity, so a PAT draws nothing from who holds it.
 *
 * Separated from {@link enforceRecordAccess} because the router deliberately
 * skips the *owner-side* pass for user-parented resources (see there) and must
 * not skip this one with it: the reason owner visibility is wrong in a user
 * subtree has nothing to do with what a credential was scoped for.
 */
function applyCredentialCeiling(
  caller: User,
  request: AccessRequest,
  grants: () => Grant[],
  filterEval?: FilterEval,
): void {
  if (cappedByScope(caller, request.verb)) {
    throw new HttpError(403, 'this token is not scoped for that action');
  }

  if (caller.pat) {
    const tGrants = tokenGrantsFor(grants(), caller.pat.id);
    const tokenDecision = resolve(
      { isSuperuser: false },
      request,
      tokenPrincipals(caller.pat.id),
      tGrants,
      filterEval,
    );
    if (!tokenDecision.allow) throw new HttpError(403, 'this token is not scoped for that action');
  }
}

/**
 * Whether the caller's OAuth scope forbids this verb.
 *
 * Every session carries a binding row — an interactive login gets one with a
 * null scope — so the presence of `caller.oauth` says nothing on its own. Only
 * a scope that actually withholds write narrows anything, which is also what
 * keeps ordinary logins off the grant-gathering path below.
 */
export function cappedByScope(caller: User, verb: Verb): boolean {
  if (!caller.oauth) return false;
  if (verb === 'read') return false;
  return !scopeAllowsWrite(caller.oauth.scope);
}

/**
 * Apply only the credential ceiling to a single-record or create request.
 *
 * Used on the paths where the owner-side grant pass is intentionally not run —
 * today that is every resource parented to `user`, whose access is governed by
 * `checkUserScope` (subtree ownership by path) instead. `checkUserScope` answers
 * "is this your subtree"; it has nothing to say about how far the credential in
 * your hand was scoped, which is what this adds back.
 */
export function enforceCredentialCeiling(
  ctx: EnforceContext,
  db: Database,
  opts: {
    caller: User | null;
    verb: Verb;
    resourceType: string;
    plural: string;
    schema: Schema;
    recordId?: string;
    recordPath?: string;
  },
): void {
  const { caller } = opts;
  if (!caller) return;
  // An unattenuated credential adds nothing, and must not pay for the check:
  // this runs on every user-subtree request, which is the SPA's hot path.
  if (!caller.pat && !cappedByScope(caller, opts.verb)) return;

  const request: AccessRequest = {
    verb: opts.verb,
    resourceType: opts.resourceType,
    appId: ctx.appIdFor(opts.plural),
    recordId: opts.recordId,
    recordOwner: opts.recordPath ? ownerOf(db, opts.plural, opts.recordPath) : undefined,
  };
  const filterEval: FilterEval = (filter) => {
    if (!opts.recordPath) return true;
    return recordMatchesFilter(
      db,
      opts.plural,
      opts.recordPath,
      filter,
      opts.schema,
      subjectOf(caller),
    );
  };
  // Gathered lazily: the scope cap needs no grants, only the PAT pass does.
  applyCredentialCeiling(caller, request, () => ctx.store.gatherFor(caller.id).grants, filterEval);
}

/** True iff the addressed row satisfies `filter` (subject.* bound to the caller). */
function recordMatchesFilter(
  db: Database,
  plural: string,
  recordPath: string,
  filter: string,
  schema: Schema,
  subject: FilterSubject,
): boolean {
  let compiled;
  try {
    compiled = compileFilter(filter, schema, { subject });
  } catch {
    logInvalidFilter(filter);
    return false; // a broken filter grants nothing
  }
  try {
    const table = sanitizeTableName(plural);
    const row = db
      .query(`SELECT 1 FROM ${table} WHERE path = ? AND (${compiled.sql}) LIMIT 1`)
      .get(recordPath, ...compiled.params);
    return !!row;
  } catch {
    return false;
  }
}

// ───────────────────── parent access inheritance ─────────────────────

/**
 * One side of an inherited request — the governing ancestor record, or the
 * child being addressed. `recordPath` is absent for a child create or list.
 */
export interface InheritedTarget {
  resourceType: string;
  plural: string;
  schema: Schema;
  recordId?: string;
  recordPath?: string;
}

/** The `AccessRequest` + row-filter evaluator for one side of an inherited request. */
function requestFor(
  ctx: EnforceContext,
  db: Database,
  caller: User,
  verb: Verb,
  target: InheritedTarget,
): { request: AccessRequest; filterEval: FilterEval } {
  return {
    request: {
      verb,
      resourceType: target.resourceType,
      appId: ctx.appIdFor(target.plural),
      recordId: target.recordId,
      recordOwner: target.recordPath ? ownerOf(db, target.plural, target.recordPath) : undefined,
    },
    // Same create rule as enforceRecordAccess: with no row yet, a filtered
    // grant describes rows you may see and change, not whether you may add one.
    filterEval: (filter) =>
      target.recordPath
        ? recordMatchesFilter(db, target.plural, target.recordPath, filter, target.schema, subjectOf(caller))
        : true,
  };
}

/** True when a deny among `grants` blocks `request` — allows are ignored. */
function deniedBy(
  request: AccessRequest,
  principals: Principals,
  grants: Grant[],
  filterEval: FilterEval,
): boolean {
  const denies = grants.filter((g) => g.effect === 'deny');
  if (denies.length === 0) return false;
  return resolve({ isSuperuser: false }, request, principals, denies, filterEval).reason === 'denied';
}

/**
 * Authorize a single-record request, or a create, on a resource that inherits
 * its access (see `./inherit`). Throws 403 when denied.
 *
 *  1. **The governing ancestor decides.** The caller needs `verb` on the
 *     ancestor record — read to see a child, write to add, change, or remove
 *     one. The child row's own `_owner` and allow grants play no part, so a
 *     record someone else added under your parent is yours to see.
 *  2. **Denies still apply on the way down.** A role that allows gift cards
 *     but denies transactions keeps denying transactions: inheritance only ever
 *     sources *allows* from the ancestor. The same holds for every inheriting
 *     ancestor in between — a deny on one perk hides its redemptions.
 *  3. **The credential ceiling still applies.** A read-only OAuth scope caps
 *     verbs as anywhere else. A PAT passes when its own grants allow the verb on
 *     *either* the ancestor or the child type — so a token scoped to one
 *     collection keeps working, and a token shared on one record reaches that
 *     record's children.
 */
export function enforceInheritedAccess(
  ctx: EnforceContext,
  db: Database,
  opts: {
    caller: User | null;
    verb: Verb;
    governor: InheritedTarget;
    intermediates?: InheritedTarget[];
    child: InheritedTarget;
  },
): void {
  const { caller, verb } = opts;
  if (!caller) return; // no auth context (unit tests); auth middleware enforces presence

  const denied = (): never => {
    throw new HttpError(403, 'you do not have access to this resource');
  };
  const gathered = ctx.store.gatherFor(caller.id);
  const { principals, grants } = gathered;
  const isSuperuser = caller.type === TYPE_SUPERUSER;
  const gov = requestFor(ctx, db, caller, verb, opts.governor);
  const child = requestFor(ctx, db, caller, verb, opts.child);
  // Everything beneath the governor whose denies apply: the inheriting
  // ancestors in between, then the addressed child itself.
  const beneath = [
    ...(opts.intermediates ?? []).map((a) => requestFor(ctx, db, caller, verb, a)),
    child,
  ];

  if (!resolve({ isSuperuser }, gov.request, principals, grants, gov.filterEval).allow) denied();
  if (!isSuperuser && beneath.some((b) => deniedBy(b.request, principals, grants, b.filterEval))) {
    denied();
  }

  if (cappedByScope(caller, verb)) {
    throw new HttpError(403, 'this token is not scoped for that action');
  }
  if (caller.pat) {
    const tPrincipals = tokenPrincipals(caller.pat.id);
    const tGrants = tokenGrantsFor(grants, caller.pat.id);
    const viaGovernor = resolve({ isSuperuser: false }, gov.request, tPrincipals, tGrants, gov.filterEval).allow;
    const viaChild = resolve({ isSuperuser: false }, child.request, tPrincipals, tGrants, child.filterEval).allow;
    const tokenDenied = beneath.some((b) => deniedBy(b.request, tPrincipals, tGrants, b.filterEval));
    if ((!viaGovernor && !viaChild) || tokenDenied) {
      throw new HttpError(403, 'this token is not scoped for that action');
    }
  }
}

/**
 * Authorize a LIST of an inheriting resource and return its WHERE fragment, or
 * `null` for no restriction. A child list is always under one concrete parent,
 * so this is one authorization of the governing ancestor (403 when the caller
 * can't read it — the same answer a user subtree gives), a 403 as well when a
 * deny covers an ancestor in between, and then row narrowing for what the
 * ancestors can't speak to: denies on the child type, and a PAT that reaches
 * the child type but not this ancestor.
 */
export function inheritedListClause(
  ctx: EnforceContext,
  db: Database,
  opts: {
    caller: User | null;
    governor: InheritedTarget;
    intermediates?: InheritedTarget[];
    child: InheritedTarget;
  },
): { sql: string; params: (string | number)[] } | null {
  const { caller } = opts;
  if (!caller) return null;

  const gathered = ctx.store.gatherFor(caller.id);
  const { principals, grants } = gathered;
  const isSuperuser = caller.type === TYPE_SUPERUSER;
  const gov = requestFor(ctx, db, caller, 'read', opts.governor);
  const between = (opts.intermediates ?? []).map((a) => requestFor(ctx, db, caller, 'read', a));
  const forbidden = (): never => {
    throw new HttpError(403, 'you do not have access to this resource');
  };
  if (!resolve({ isSuperuser }, gov.request, principals, grants, gov.filterEval).allow) forbidden();
  if (!isSuperuser && between.some((b) => deniedBy(b.request, principals, grants, b.filterEval))) {
    forbidden();
  }

  const target = { resourceType: opts.child.resourceType, appId: ctx.appIdFor(opts.child.plural) };
  // Child-type denies as a row clause: the ancestor already allowed the whole
  // list, so stand in a broad allow and let computeVisibility subtract denies.
  const asAllowed = (gs: Grant[], subject: Grant['subject']): Grant[] => [
    { subject, capability: 'read', effect: 'allow', target: { scope: 'collection', resource_type: opts.child.resourceType } },
    ...gs.filter((g) => g.effect === 'deny'),
  ];
  const ownerClause = isSuperuser
    ? null
    : visibilityToSql(
        computeVisibility(target, principals, asAllowed(grants, { type: 'everyone' })),
        caller.id,
        opts.child.schema,
        subjectOf(caller),
      );

  if (!caller.pat) return ownerClause;

  // Token side: reading the ancestor through the token lets it see every child
  // (minus the token's own denies); otherwise it sees what its grants on the
  // child type allow, exactly as for an independent collection.
  const tPrincipals = tokenPrincipals(caller.pat.id);
  const tGrants = tokenGrantsFor(grants, caller.pat.id);
  if (between.some((b) => deniedBy(b.request, tPrincipals, tGrants, b.filterEval))) {
    throw new HttpError(403, 'this token is not scoped for that action');
  }
  const tokenReadsGovernor = resolve({ isSuperuser: false }, gov.request, tPrincipals, tGrants, gov.filterEval).allow;
  const tokenVisibility = computeVisibility(
    target,
    tPrincipals,
    tokenReadsGovernor ? asAllowed(tGrants, { type: 'token', id: caller.pat.id }) : tGrants,
  );
  const tokenClause = visibilityToSql(tokenVisibility, TOKEN_SENTINEL_USER, opts.child.schema, subjectOf(caller));
  return intersectClauses(ownerClause, tokenClause);
}

/**
 * Compute the LIST visibility clause for the current caller, or `null` for no
 * restriction. A superuser (break-glass) and a caller with no restrictions both
 * return null (unrestricted). The router only calls this once a baseline exists.
 */
export function listVisibilityClause(
  ctx: EnforceContext,
  opts: {
    caller: User | null;
    resourceType: string;
    plural: string;
    schema: Schema;
  },
): { sql: string; params: (string | number)[] } | null {
  const { caller } = opts;
  if (!caller) return null;

  const target = { resourceType: opts.resourceType, appId: ctx.appIdFor(opts.plural) };

  // Owner-side visibility: the caller's full reach. Superuser is unrestricted
  // (break-glass) — but only as the *ceiling*; a PAT still narrows it below.
  let ownerClause: { sql: string; params: (string | number)[] } | null;
  if (caller.type === TYPE_SUPERUSER) {
    ownerClause = null; // unrestricted
  } else {
    const gathered = ctx.store.gatherFor(caller.id);
    const visibility = computeVisibility(
      target,
      gathered.principals,
      gathered.grants,
    );
    ownerClause = visibilityToSql(visibility, caller.id, opts.schema, subjectOf(caller));
  }

  if (!caller.pat) return ownerClause;

  // Token-side visibility: only the token's grants, resolved with the sentinel
  // principal so the owner-rows fast-path can't leak the owner's own records
  // into a grantless (or narrowly-scoped) token's list. Final list = owner ∩ token.
  const gathered = ctx.store.gatherFor(caller.id);
  const tokenVisibility = computeVisibility(
    target,
    tokenPrincipals(caller.pat.id),
    tokenGrantsFor(gathered.grants, caller.pat.id),
  );
  const tokenClause = visibilityToSql(
    tokenVisibility,
    TOKEN_SENTINEL_USER,
    opts.schema,
    subjectOf(caller),
  );
  return intersectClauses(ownerClause, tokenClause);
}

/**
 * The LIST visibility a credential imposes on its own, for the paths where the
 * owner-side clause is not computed (user-parented resources). Returns `null`
 * for an unattenuated credential — nothing to narrow.
 *
 * A read-only OAuth scope contributes nothing here: it caps verbs, and LIST is
 * a read. Only a PAT narrows what rows are visible.
 */
export function credentialVisibilityClause(
  ctx: EnforceContext,
  opts: {
    caller: User | null;
    resourceType: string;
    plural: string;
    schema: Schema;
  },
): { sql: string; params: (string | number)[] } | null {
  const { caller } = opts;
  if (!caller?.pat) return null;

  const gathered = ctx.store.gatherFor(caller.id);
  const tokenVisibility = computeVisibility(
    { resourceType: opts.resourceType, appId: ctx.appIdFor(opts.plural) },
    tokenPrincipals(caller.pat.id),
    tokenGrantsFor(gathered.grants, caller.pat.id),
  );
  return visibilityToSql(
    tokenVisibility,
    TOKEN_SENTINEL_USER,
    opts.schema,
    subjectOf(caller),
  );
}

/**
 * AND two LIST WHERE fragments. `null` means "no restriction" (identity), so it
 * drops out of the conjunction; a `0` (see-nothing) short-circuits to `0`.
 */
function intersectClauses(
  a: { sql: string; params: (string | number)[] } | null,
  b: { sql: string; params: (string | number)[] } | null,
): { sql: string; params: (string | number)[] } | null {
  if (a === null) return b;
  if (b === null) return a;
  if (a.sql === '0' || b.sql === '0') return { sql: '0', params: [] };
  return { sql: `(${a.sql}) AND (${b.sql})`, params: [...a.params, ...b.params] };
}

/** Compile a grant filter to `(sql, params)`, or null if it can't compile. */
function compiledFilterClause(
  filter: string,
  schema: Schema,
  subject: FilterSubject,
): { sql: string; params: (string | number)[] } | null {
  try {
    const c = compileFilter(filter, schema, { subject });
    return { sql: c.sql, params: [...c.params] };
  } catch {
    logInvalidFilter(filter);
    return null;
  }
}

/**
 * Translate a Visibility verdict into a SQL fragment over the resource table,
 * compiling any filter-grant clauses (§3.6) with `subject.*` bound to the caller.
 * A filter that can't compile is dropped (an allow grants nothing; a deny is
 * skipped and logged) — write-time validation should prevent this.
 */
function visibilityToSql(
  v: Visibility,
  callerId: string,
  schema: Schema,
  subject: FilterSubject,
): { sql: string; params: (string | number)[] } | null {
  const compileMany = (filters: string[]) =>
    filters.map((f) => compiledFilterClause(f, schema, subject)).filter((c): c is NonNullable<typeof c> => c !== null);

  switch (v.mode) {
    case 'all':
      return null;
    case 'none':
      return { sql: '0', params: [] };
    case 'all-except': {
      const parts: string[] = [];
      const params: (string | number)[] = [];
      if (v.denyRecordIds.length) {
        parts.push(`id NOT IN (${v.denyRecordIds.map(() => '?').join(', ')})`);
        params.push(...v.denyRecordIds);
      }
      for (const c of compileMany(v.denyFilters)) {
        parts.push(`NOT (${c.sql})`);
        params.push(...c.params);
      }
      if (parts.length === 0) return null;
      return { sql: parts.join(' AND '), params };
    }
    case 'only': {
      const orParts: string[] = [`${OWNER_COLUMN} = ?`];
      const params: (string | number)[] = [callerId];
      if (v.allowRecordIds.length) {
        orParts.push(`id IN (${v.allowRecordIds.map(() => '?').join(', ')})`);
        params.push(...v.allowRecordIds);
      }
      for (const c of compileMany(v.allowFilters)) {
        orParts.push(`(${c.sql})`);
        params.push(...c.params);
      }
      let sql = `(${orParts.join(' OR ')})`;
      if (v.denyRecordIds.length) {
        sql += ` AND id NOT IN (${v.denyRecordIds.map(() => '?').join(', ')})`;
        params.push(...v.denyRecordIds);
      }
      for (const c of compileMany(v.denyFilters)) {
        sql += ` AND NOT (${c.sql})`;
        params.push(...c.params);
      }
      return { sql, params };
    }
  }
}

// ─────────────── access-grant self-governance (§15.3) ───────────────

/** The ACL machinery governs itself — no grant may target these collections. */
const PROTECTED_GRANT_TARGET_TYPES = new Set([
  'access-grant',
  'role',
  'group',
  'group-membership',
]);

export interface GrantTargetSpec {
  scope?: string;
  app?: string;
  resource_type?: string;
  resource_id?: string;
  /** The grant's subject kind, carried here only so the write rule can gate it. */
  subject_type?: string;
  /** `allow` (the default when unset) or `deny`. */
  effect?: string;
}

function ownerOfById(db: Database, plural: string, id: string): string | null {
  try {
    const row = db
      .query(`SELECT ${OWNER_COLUMN} AS owner FROM ${sanitizeTableName(plural)} WHERE id = ?`)
      .get(id) as { owner: string | null } | null;
    return row?.owner ?? null;
  } catch {
    return null;
  }
}

/** The "manage on the grant's target" request, shaped by the target's scope. */
function manageRequestForTarget(
  ctx: EnforceContext,
  reg: Registry,
  db: Database,
  target: GrantTargetSpec,
): AccessRequest {
  const pluralOf = (singular?: string) => (singular ? reg.get(singular)?.plural ?? '' : '');
  switch (target.scope) {
    case 'record': {
      const plural = pluralOf(target.resource_type);
      return {
        verb: 'manage',
        resourceType: target.resource_type ?? '',
        appId: ctx.appIdFor(plural),
        recordId: target.resource_id,
        recordOwner: target.resource_id ? ownerOfById(db, plural, target.resource_id) : undefined,
      };
    }
    case 'collection': {
      const plural = pluralOf(target.resource_type);
      return { verb: 'manage', resourceType: target.resource_type ?? '', appId: ctx.appIdFor(plural) };
    }
    case 'app':
      return { verb: 'manage', resourceType: '', appId: target.app ?? null };
    default: // 'all' (or unspecified): manage over everything
      return { verb: 'manage', resourceType: '', appId: null };
  }
}

/**
 * Authorize a write to an `access-grant` (§15.3): superuser, or a caller with
 * `manage` on the grant's target. No grant may target the ACL machinery itself
 * (no grants-on-grants). Requiring manage-on-target also prevents privilege
 * escalation — you can only grant over what you already fully control.
 */
export function enforceGrantWrite(
  ctx: EnforceContext,
  reg: Registry,
  db: Database,
  caller: User | null,
  target: GrantTargetSpec,
): void {
  if (!caller) return;
  if (caller.type === TYPE_SUPERUSER) return; // break-glass

  const deny = (): never => {
    throw new HttpError(403, 'you do not have permission to write this grant');
  };

  // Grants addressed to a personal access token are written only by the mint
  // flow (which runs as the leased admin and validates subset-of-owner). A
  // regular caller must never hand-write a token-subject grant through the
  // public grants API — that would be the escalation the subset check prevents.
  if (target.subject_type === 'token') {
    deny();
  }

  if (target.resource_type && PROTECTED_GRANT_TARGET_TYPES.has(target.resource_type)) {
    deny(); // grants-on-grants
  }

  const { principals, grants } = ctx.store.gatherFor(caller.id);
  const decision = resolve(
    { isSuperuser: false },
    manageRequestForTarget(ctx, reg, db, target),
    principals,
    grants,
  );
  if (decision.allow) return;
  deny(); // no manage-on-target
}

/** A throwaway subject for compile-only validation when there's no live caller. */
const VALIDATION_SUBJECT: FilterSubject = { id: '', email: '', display_name: '' };

/**
 * Validate an access-grant's `filter` at write time (§3.6, Phase 4 follow-up).
 *
 * A collection-scope filter must **compile against its target collection's
 * schema** — so a broken expression (bad syntax, an unknown field after a
 * rename) is rejected at grant create/update with a 400, instead of silently
 * failing open at enforcement time (where an un-compilable deny-filter would
 * quietly stop applying). Only collection-scope filters are meaningful to the
 * resolver, so filters at other scopes aren't compiled here.
 *
 * Compilation is subject-aware: `subject.*` operands are bound to a throwaway
 * subject, since we only care that the expression is *well-formed*, not what it
 * evaluates to. An unresolvable `resource_type` is left alone — collection
 * existence is not otherwise validated at grant-write, and there's no schema to
 * compile against.
 */
export function validateGrantFilter(
  reg: Registry,
  target: GrantTargetSpec,
  filter: string | undefined,
): void {
  if (!filter) return; // no filter → nothing to validate
  if (target.scope !== 'collection') return; // filter only applies at collection scope
  const resource = target.resource_type ? reg.get(target.resource_type) : undefined;
  if (!resource) return; // unknown target type: no schema to validate against
  try {
    compileFilter(filter, resource.schema, { subject: VALIDATION_SUBJECT });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(400, `invalid grant filter: ${message}`);
  }
}

/**
 * Refuse a record-scope **allow** grant on a resource that inherits its access
 * (see `./inherit`). Its rows are reachable by whoever may reach the governing
 * ancestor, so an allow on one child row would never be consulted — accepting it
 * would tell the sharer something happened when nothing did. The error names
 * the ancestor to share instead. A record-scope *deny* stays valid: denies on
 * the child type narrow what the ancestor allows.
 */
export function validateGrantInheritance(reg: Registry, target: GrantTargetSpec): void {
  if (target.scope !== 'record' || (target.effect ?? 'allow') === 'deny') return;
  const resource = target.resource_type ? reg.get(target.resource_type) : undefined;
  if (!resource) return;
  const governor = governingResource(reg, resource);
  if (!governor) return;
  throw new HttpError(
    400,
    `${resource.plural} inherit their access from their parent ${governor.singular}; ` +
      `share the ${governor.singular} instead`,
  );
}

/**
 * De-dupe warnings *per distinct filter*, not globally: an un-compilable filter
 * is fail-open for a deny grant (the deny silently stops applying), so every
 * different broken filter must surface at least once — a single process-wide
 * flag would hide the second one entirely. Bounded so a pathological stream of
 * distinct broken filters can't grow it without limit; past the cap we warn
 * every time rather than going quiet.
 */
const warnedInvalidFilters = new Set<string>();
const WARNED_INVALID_FILTER_CAP = 256;
function logInvalidFilter(filter: string): void {
  if (warnedInvalidFilters.size < WARNED_INVALID_FILTER_CAP) {
    if (warnedInvalidFilters.has(filter)) return;
    warnedInvalidFilters.add(filter);
  }
  log.warn('ignoring un-compilable grant filter', { filter });
}
