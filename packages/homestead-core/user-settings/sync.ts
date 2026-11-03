/**
 * Push the per-user `user-preference` schema to aepbase.
 *
 * Called from `frontend/src/instrumentation.ts` on Next.js boot,
 * alongside the static resource sync and the app-flags syncer.
 * Idempotent: on repeat runs it PATCHes the existing resource
 * definition when the schema has drifted, no-ops when stable.
 *
 * The `user-preference` resource definition used to live in
 * `BUILTIN_RESOURCE_DEFS` with a hand-written schema; that file no
 * longer declares it. The schema is now `STATIC_PROPERTIES` (dashboard
 * widget customization, kept where it was for now) merged with the
 * flattened per-user-setting fields contributed by every app that
 * declares `userSettings`.
 */

import { jsonEqual } from '../resources/equal';
import {
  buildSchemaProperties,
  type UserSettingDefs,
} from './settings';

const RESOURCE_SINGULAR = 'user-preference';
const RESOURCE_PLURAL = 'preferences';
const DEFINITIONS_PATH = 'aep-resource-definitions';

/**
 * Per-user fields that pre-date the `userSettings` declaration system
 * and aren't (yet) owned by a feature app. Kept verbatim so existing
 * data continues to round-trip and the `DashboardWidgetSettings` UI
 * keeps working without changes.
 *
 * `map_provider` is also retained as a transitional read-fallback for
 * users whose preference record was created before the migration to
 * `people__map_provider`. New writes target the flattened key only;
 * this static field can be dropped in a follow-up after one deploy
 * cycle.
 */
const STATIC_PROPERTIES: Record<string, Record<string, unknown>> = {
  map_provider: {
    type: 'string',
    description: 'Legacy field. Replaced by people__map_provider.',
  },
  dashboard_widget_order: {
    type: 'string',
    description:
      "JSON-encoded array of dashboard widget ids in the user's preferred display order. Widgets not listed fall back to their app-declared order.",
  },
  dashboard_hidden_widgets: {
    type: 'string',
    description: 'JSON-encoded array of dashboard widget ids the user has hidden.',
  },
  sidebar_pinned_apps: {
    type: 'string',
    description:
      'JSON-encoded array of app ids the user has pinned to their sidebar over the household default.',
  },
  sidebar_unpinned_apps: {
    type: 'string',
    description:
      'JSON-encoded array of app ids the user has unpinned from their sidebar over the household default.',
  },
};

interface AepResourceDefinition {
  singular?: string;
  plural?: string;
  description?: string;
  user_settable_create?: boolean;
  parents?: string[];
  schema?: unknown;
}

export interface SyncOptions {
  aepbaseUrl: string;
  token: string;
  defs: UserSettingDefs;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  /**
   * Column names this sync may drop even when they still hold data.
   *
   * The engine refuses a populated column drop by default, so an app removing
   * a user setting would otherwise wedge here: the PATCH carries the whole schema
   * and throws before any DDL, so *nothing* in it applies — including fields
   * other apps added in the same boot. One un-droppable column freezes the
   * resource. Filled from migrations that declare a matching `drops` entry
   * against `user-preference`, exactly as the resource sync does.
   */
  authorizedDrops?: ReadonlySet<string>;

}

export interface SyncResult {
  action: 'created' | 'updated' | 'noop';
}

function buildSchema(defs: UserSettingDefs): {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
} {
  const dynamic = buildSchemaProperties(defs);
  const properties: Record<string, Record<string, unknown>> = {
    ...STATIC_PROPERTIES,
    ...dynamic,
  };
  // Sort for stable diffs.
  const sorted: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(properties).sort()) {
    sorted[key] = properties[key];
  }
  return { type: 'object', properties: sorted };
}

export async function syncUserSettingsSchema(
  options: SyncOptions,
): Promise<SyncResult> {
  const { aepbaseUrl, token, defs, logger = console, authorizedDrops } = options;
  const schema = buildSchema(defs);

  const desired: AepResourceDefinition = {
    singular: RESOURCE_SINGULAR,
    plural: RESOURCE_PLURAL,
    description:
      'Per-user app preferences. Schema is generated from declared user settings (AppConfig.userSettings) plus a small static carve-out for dashboard widget customization.',
    user_settable_create: true,
    parents: ['user'],
    schema,
  };

  const existing = await fetchExisting(aepbaseUrl, token);

  if (!existing) {
    await createDefinition(aepbaseUrl, token, desired);
    logger.info(
      `[user-settings] created resource definition with ${Object.keys(schema.properties).length} field(s)`,
    );
    return { action: 'created' };
  }

  if (jsonEqual(existing.schema, schema)) {
    return { action: 'noop' };
  }

  await patchDefinition(aepbaseUrl, token, { schema }, authorizedDrops);
  logger.info(
    `[user-settings] updated resource definition to ${Object.keys(schema.properties).length} field(s)`,
  );
  return { action: 'updated' };
}

async function fetchExisting(
  aepbaseUrl: string,
  token: string,
): Promise<AepResourceDefinition | null> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}/${RESOURCE_SINGULAR}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase GET /${DEFINITIONS_PATH}/${RESOURCE_SINGULAR} → ${res.status}: ${text}`,
    );
  }
  return (await res.json()) as AepResourceDefinition;
}

async function createDefinition(
  aepbaseUrl: string,
  token: string,
  body: AepResourceDefinition,
): Promise<void> {
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}?id=${RESOURCE_SINGULAR}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase POST /${DEFINITIONS_PATH} → ${res.status}: ${text}`,
    );
  }
}

async function patchDefinition(
  aepbaseUrl: string,
  token: string,
  body: Partial<AepResourceDefinition>,
  authorizedDrops?: ReadonlySet<string>,
): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/merge-patch+json',
  };
  // Same wire contract as the resource sync: absent means "refuse a populated
  // drop", which is the safe default for a bare PATCH.
  if (authorizedDrops && authorizedDrops.size > 0) {
    headers['X-Homestead-Authorized-Drops'] = [...authorizedDrops].join(',');
  }
  const res = await fetch(
    `${aepbaseUrl}/${DEFINITIONS_PATH}/${RESOURCE_SINGULAR}`,
    { method: 'PATCH', headers, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `aepbase PATCH /${DEFINITIONS_PATH}/${RESOURCE_SINGULAR} → ${res.status}: ${text}`,
    );
  }
}
