/**
 * Shared visibility enum for module-level gating.
 *
 * Every module automatically exposes an `enabled` flag backed by this
 * enum (see `getAllModuleFlagDefs` in `@/modules/registry`). The
 * `useIsModuleEnabled` hook turns a stored value here into a yes/no
 * decision for the current viewer.
 */

export const MODULE_VISIBILITY_OPTIONS = ['superusers', 'all', 'none'] as const;

export type ModuleVisibility = (typeof MODULE_VISIBILITY_OPTIONS)[number];

export const DEFAULT_MODULE_VISIBILITY: ModuleVisibility = 'all';
