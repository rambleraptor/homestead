/**
 * The always-installed core apps and the helper that merges them into
 * an operator's app list.
 *
 * Kept out of `registry.ts` on purpose: that file imports zero `AppConfig`
 * instances so a bare `import` stays type-only (see the note at the top of
 * registry.ts). This app is the one place that names the core apps, so
 * every consumer that boots the registry from a config (the SPA shim, the
 * sidecar, and the launcher's app-access serializer) shares one list and
 * can't drift.
 */

import { appDrawerApp } from '../app-drawer/app.config';
import { chatApp } from '../chat/app.config';
import { dashboardApp } from '../dashboard/app.config';
import { notificationsApp } from '../notifications/app.config';
import { settingsApp } from '../settings/app.config';
import { superuserApp } from '../superuser/app.config';
import { getAllApps } from './registry';
import type { AppConfig } from './types';

/**
 * Apps every instance ships regardless of the operator's config. Their
 * collections are part of the core experience and are never gated by the
 * backend app-access middleware (aepbase's own user-parenting protects
 * the user-scoped ones).
 *
 * The Users app is not listed here directly — it's a child of the Superuser
 * app (`superuserApp.children`) and ships as part of that subtree.
 */
export const ALWAYS_INSTALLED_APPS: AppConfig[] = [
  dashboardApp,
  superuserApp,
  settingsApp,
  appDrawerApp,
  chatApp,
  notificationsApp,
];

/**
 * Ids of the always-installed core apps, walking nested children so a
 * built-in app declared as a child (e.g. Users under Superuser) is still
 * recognized as always-installed — its collections must stay exempt from
 * the app-access gate just like its parent's.
 */
export const ALWAYS_INSTALLED_APP_IDS: string[] = (function collectIds(
  apps: AppConfig[],
): string[] {
  return apps.flatMap((app) => [app.id, ...collectIds(app.children ?? [])]);
})(ALWAYS_INSTALLED_APPS);

/**
 * Append the always-installed core apps to an operator's app list,
 * skipping any the operator already declared (matched by id).
 */
export function withAlwaysInstalled(operatorApps: AppConfig[]): AppConfig[] {
  const seen = new Set(operatorApps.map((m) => m.id));
  const merged = [...operatorApps];
  for (const core of ALWAYS_INSTALLED_APPS) {
    if (!seen.has(core.id)) merged.push(core);
  }
  return merged;
}

/**
 * The operator's own apps — everything in the registry that isn't one of the
 * always-installed core apps. Empty on a fresh project with no `apps` entry
 * in `homestead.config.ts` and nothing under `apps/`, which is how the
 * dashboard knows to show its "add your first app" guidance.
 */
export function getFeatureApps(): AppConfig[] {
  const coreIds = new Set(ALWAYS_INSTALLED_APP_IDS);
  return getAllApps().filter((app) => !coreIds.has(app.id));
}
