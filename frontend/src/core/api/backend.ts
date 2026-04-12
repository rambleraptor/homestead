/**
 * Per-module backend selection flag.
 *
 * During the PocketBase → aepbase migration each module can be flipped
 * independently via an env var so we can validate one module at a time and
 * still have an escape hatch back to PB if a module breaks. Defaults to
 * PocketBase for every module — turning aepbase on requires explicit opt-in.
 *
 * To enable aepbase for a module, set the matching env var (in
 * `frontend/.env.local`, etc.) and restart the dev server:
 *
 *   NEXT_PUBLIC_USE_AEPBASE_GIFT_CARDS=true
 *   NEXT_PUBLIC_USE_AEPBASE_SETTINGS=true
 *
 * NEXT_PUBLIC_* env vars are inlined at build time, so reading them at module
 * top-level is safe and SSR-stable.
 *
 * Note: auth (login/logout/refreshUser) is NOT flag-controlled. AuthContext
 * always talks to aepbase. To run the data layer on PB you still need an
 * aepbase user account to log in — the default superuser works fine.
 */

export type BackendModule =
  | 'auth'
  | 'gift-cards'
  | 'credit-cards'
  | 'people'
  | 'notifications'
  | 'groceries'
  | 'recipes'
  | 'actions'
  | 'hsa-receipts'
  | 'settings';

const ENABLED: Record<BackendModule, boolean> = {
  // `auth` controls login/logout/refresh in AuthContext. Default is PB so
  // the existing e2e suite (which only spins up PocketBase) keeps working
  // unchanged. Flip to `true` to log in via aepbase locally.
  auth: process.env.NEXT_PUBLIC_USE_AEPBASE_AUTH === 'true',
  'gift-cards': process.env.NEXT_PUBLIC_USE_AEPBASE_GIFT_CARDS === 'true',
  'credit-cards': process.env.NEXT_PUBLIC_USE_AEPBASE_CREDIT_CARDS === 'true',
  people: process.env.NEXT_PUBLIC_USE_AEPBASE_PEOPLE === 'true',
  notifications: process.env.NEXT_PUBLIC_USE_AEPBASE_NOTIFICATIONS === 'true',
  groceries: process.env.NEXT_PUBLIC_USE_AEPBASE_GROCERIES === 'true',
  recipes: process.env.NEXT_PUBLIC_USE_AEPBASE_RECIPES === 'true',
  actions: process.env.NEXT_PUBLIC_USE_AEPBASE_ACTIONS === 'true',
  'hsa-receipts': process.env.NEXT_PUBLIC_USE_AEPBASE_HSA_RECEIPTS === 'true',
  settings: process.env.NEXT_PUBLIC_USE_AEPBASE_SETTINGS === 'true',
};

/**
 * Returns true when the given module should route through aepbase, false
 * when it should keep using the legacy PocketBase code path.
 *
 * Despite the name this is NOT a React hook — it's a pure flag lookup.
 * Named with "is" to avoid React's "use" rule and make the call site read
 * naturally: `if (isAepbaseEnabled('gift-cards'))`.
 */
export function isAepbaseEnabled(module: BackendModule): boolean {
  return ENABLED[module];
}
