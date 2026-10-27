/**
 * Which collections the built-in household roles cover, and how.
 *
 * The seeded `admin` / `member` roles used to confer one `all`-scope grant —
 * "everything, forever". That blanket is what made a per-resource opt-out
 * necessary in the first place: a collection that wanted to be private had no
 * way to say "not me", so it said so in its definition instead. Enumerating the
 * roles removes the blanket, and with it the need for the opt-out.
 *
 * A household role covers a collection in one of two shapes:
 *   - **shared** — a plain collection grant. Every household member sees and
 *     edits every row. This is almost everything.
 *   - **own rows only** — the same grant carrying a `created_by == subject.id`
 *     filter, so a member may add rows and reach their own, but not anyone
 *     else's. Row visibility for the owner actually comes from `_owner`
 *     (owner ⇒ manage, engine-set and reliable even when `created_by` is
 *     absent); the filter's real job is to authorize CREATE without opening
 *     everyone else's rows.
 *
 * Privacy is therefore the shape of a grant. Which shape a collection gets is
 * declared by the resource itself (`ResourceDefinition.access`) and translated
 * here — so this module knows the *models*, never the app resources that use
 * them.
 */

import type { ResourceDefinition } from '../resources/types';
import type { AppConfig } from '../apps/types';

/**
 * Scopes a grant to rows the caller created — the filter the `private` access
 * model carries. Its real job is authorizing CREATE: on create there is no row
 * to match, so the filter is vacuously true and the grant permits adding a row,
 * while row visibility for the owner comes from the engine-set `_owner`.
 */
export const OWN_ROWS_FILTER = 'created_by == subject.id';

/**
 * Household collections the engine manages itself, so they never appear in any
 * app's declared definitions but still need covering. `app-flag` is the
 * household-wide settings singleton, built at boot from the flags apps declare.
 */
const ENGINE_MANAGED_SHARED: readonly string[] = ['app-flag'];

/**
 * The permissions data model governs its own access by the manage-on-target
 * rule (design §15.3) rather than by ordinary grants, so a role grant over these
 * would be inert at best and confusing at worst.
 */
const SELF_GOVERNING: readonly string[] = [
  'role',
  'group',
  'group-membership',
  'access-grant',
];

/** One collection a household role covers, and the filter (if any) scoping it. */
export interface HouseholdCollection {
  resource_type: string;
  /** Present for any resource whose `access` model declares one. */
  filter?: string;
}

/**
 * The filter a household role's grant carries for one resource, or undefined
 * for an unfiltered (fully shared) grant.
 *
 * This is the one place the {@link ResourceAccess} declaration turns into
 * enforcement. Nothing downstream changes: `HouseholdCollection` already
 * carries an arbitrary filter string and `seed.ts` passes it through verbatim,
 * and the engine already unions a grant filter with the caller's own `_owner`
 * rows (`enforce.ts` `visibilityToSql`).
 *
 * `per-record` produces a literal comparison — `visibility == 'household'` —
 * so a member reaches every household row plus their own private ones, in one
 * indexed SQL clause. The value is a declared constant from the resource
 * definition, not user input, and boot validation has already checked it
 * against the field's enum.
 */
export function householdFilterFor(def: ResourceDefinition): string | undefined {
  const access = def.access ?? { model: 'shared' as const };
  switch (access.model) {
    case 'shared':
      return undefined;
    case 'private':
      return OWN_ROWS_FILTER;
    case 'per-record':
      return `${access.field} == '${access.sharedValue}'`;
    case 'superusers':
      // Never reached: householdCollections leaves these out entirely.
      return undefined;
  }
}

/**
 * Compute the collections a household role should confer, in stable (sorted)
 * order.
 *
 * Excluded: the **self-governing** permission resources (above), which the
 * manage-on-target rule owns, and collections declared `access: { model:
 * 'superusers' }`, which no household role reaches.
 *
 * Everything else a household declares is covered — including child collections
 * like `transaction` or `perk`, which need their own grant because a grant
 * matches one `resource_type`.
 *
 * **User-parented collections are covered too**, which looks redundant and
 * isn't. The server never consults a grant for them — `enforceGrants` is false
 * for a user-parented route and `checkUserScope` governs by path instead — but
 * the *client* mirror has no such rule, so `can('read', 'notification')` is
 * exactly as false as `can()` on a collection you genuinely can't reach. Leave
 * them out and every app whose resources are all user-parented (Notifications)
 * silently drops out of the sidebar. Granting them keeps the mirror honest —
 * you can read your own notifications — and keeps an app-scope deny working,
 * which short-circuiting them client-side would not.
 */
export function householdCollections(
  defs: readonly ResourceDefinition[],
): HouseholdCollection[] {
  const excluded = new Set(SELF_GOVERNING);
  // Each resource states its own scoping. Nothing in core names an app's
  // collections any more — a privacy rule lives next to the schema it governs.
  const filters = new Map<string, string | undefined>();
  const names = new Set<string>(ENGINE_MANAGED_SHARED);
  for (const def of defs) {
    if (excluded.has(def.singular)) continue;
    // Superusers-only collections get no household grant: no grant, no access.
    if (def.access?.model === 'superusers') continue;
    names.add(def.singular);
    filters.set(def.singular, householdFilterFor(def));
  }
  return [...names].sort().map((resource_type) => {
    const filter = filters.get(resource_type);
    return filter ? { resource_type, filter } : { resource_type };
  });
}

/**
 * Apps that are part of the shell rather than the household's data, and so are
 * visible to everyone — including an account granted nothing at all.
 *
 * Settings is where you manage *your own* preferences and notifications. Gating
 * it behind a grant would leave a Guest with no way to reach their own settings,
 * which is a worse failure than the openness is a risk: there is no household
 * data behind it. Everything else collection-less (Chat, Dashboard) is granted
 * normally.
 *
 * Deliberately unconditional — not "visible unless denied". If blocking someone
 * from Settings ever becomes a real requirement, that's a feature to design, not
 * a default to lean on.
 */
export const ALWAYS_VISIBLE_APPS: readonly string[] = ['settings'];

/**
 * Apps whose visibility can only be granted at app scope: they own no
 * collections and have no children, so there is nothing else to gate on (Chat,
 * Dashboard). Without a grant they'd be invisible to everyone once the sidebar
 * stopped defaulting them to visible, so the household roles carry one app-scope
 * grant each. {@link ALWAYS_VISIBLE_APPS} are skipped — they need no grant.
 *
 * Superuser-gated apps are left out: `isAppVisible` hard-gates them on account
 * type regardless, so a grant would be inert and would only make the role
 * listing misleading. The gate is read inline rather than imported from
 * `apps/useAppVisibility` — that module pulls in React, and this one runs in the
 * boot-time seeder.
 */
export function householdApps(apps: readonly AppConfig[]): string[] {
  const out: string[] = [];
  const visit = (app: AppConfig): void => {
    for (const child of app.children ?? []) visit(child);
    const superuserOnly = (app.web?.routes ?? []).some((r) =>
      (r.gates ?? []).includes('superuser'),
    );
    if (superuserOnly) return;
    if (ALWAYS_VISIBLE_APPS.includes(app.id)) return; // visible without a grant
    const defs = typeof app.resources === 'function' ? app.resources() : app.resources ?? [];
    if (defs.length > 0) return; // gated by its collections
    if ((app.children ?? []).length > 0) return; // gated by its children
    out.push(app.id);
  };
  for (const app of apps) visit(app);
  return out.sort();
}
