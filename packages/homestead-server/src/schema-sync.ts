/**
 * Apply app-declared schema to the engine on boot. Idempotent — creates
 * what's missing, patches drift, no-ops when in sync.
 *
 * The old sidecar logged in over HTTP with AEPBASE_ADMIN_EMAIL/PASSWORD from
 * credentials.json; now the server mints a short-lived admin token directly
 * in its own database and revokes it when done — no stored credentials.
 *
 * Relies on the app registry being initialized (importing ../app-registry).
 */

import type { Database } from './engine/sqlite';
import { createLogger } from './log';
import { syncResourceDefinitions } from '@rambleraptor/homestead-core/resources/sync';
import { BUILTIN_RESOURCE_DEFS } from '@rambleraptor/homestead-core/resources/builtins';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import {
  householdApps,
  householdCollections,
} from '@rambleraptor/homestead-core/permissions/household';
import { syncAppFlagsSchema } from '@rambleraptor/homestead-core/app-flags/sync';
import { syncUserSettingsSchema } from '@rambleraptor/homestead-core/user-settings/sync';
import { sweepStaleOperations } from '@rambleraptor/homestead-core/server/operations';
import {
  getAllAppFlagDefs,
  getAllApps,
  getAllMigrations,
  getAllResourceDefs,
  getAllUserSettingDefs,
} from './app-registry';
import { mintAdminToken } from './bootstrap';
import { fieldsNeedingMasterKey, missingMasterKeyWarning } from './engine/key-check';
import { runMigrations } from './migrations';

const log = createLogger('schema-sync');

/**
 * Fold every migration's `drops` into a `resource → {fields}` map the syncs hand
 * to the engine, so a populated column named by a `drops` entry is allowed to
 * drop while every other populated column is refused.
 *
 * All three syncs draw from this, not just the resource one: `app-flag` and
 * `user-preference` have generated schemas whose columns come from declared
 * flags and user settings, so removing a declaration is a column drop like any
 * other and needs the same authorization route. Name them by their `singular`
 * in a migration's `drops` — `{ resource: 'user-preference', field:
 * 'credit_cards__perk_reminder' }`.
 */
function collectAuthorizedDrops(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const migration of getAllMigrations()) {
    for (const drop of migration.drops ?? []) {
      const fields = map.get(drop.resource) ?? new Set<string>();
      fields.add(drop.field);
      map.set(drop.resource, fields);
    }
  }
  return map;
}

export async function syncSchema(db: Database, aepbaseUrl: string): Promise<void> {
  let admin;
  try {
    admin = mintAdminToken(db);
  } catch (error) {
    log.error('no admin available; skipping sync', { err: error });
    return;
  }

  const token = admin.token;
  const authorizedDrops = collectAuthorizedDrops();
  try {
    // Hoisted: the permissions seeder derives the household roles' covered
    // collections from the same declared set the schema sync applies.
    const defs = [
      ...BUILTIN_RESOURCE_DEFS,
      ...PERMISSION_RESOURCE_DEFS,
      ...getAllResourceDefs(),
    ];

    let resourcesSynced = false;
    try {
      const result = await syncResourceDefinitions({
        aepbaseUrl,
        token,
        defs,
        authorizedDrops,
      });
      if (!result.created.length && !result.updated.length) {
        log.child('resources').info('schema already in sync', {
          definitions: result.unchanged.length,
        });
      }
      resourcesSynced = true;
    } catch (error) {
      log.child('resources').error('schema sync failed', { err: error });
    }

    // Run data migrations once the collections they target exist. Skipped if
    // the resource sync failed — migrating against a half-applied schema would
    // only record spurious failures. The runner is idempotent (a succeeded
    // migration is remembered), so a later boot retries anything still pending.
    if (resourcesSynced) {
      try {
        await runMigrations(db, { token, migrations: getAllMigrations() });
      } catch (error) {
        log.child('migrations').error('migration pass failed', { err: error });
      }
    }

    // Seed the permissions baseline (roles + role-bearing groups) once the
    // definitions exist. Idempotent: seeds each collection only when empty
    // (§8). No grant is seeded — a household starts closed. The built-in roles
    // name the collections they cover, so they're reconciled against what this
    // household currently declares: installing an app extends them, removing
    // one retracts them.
    try {
      const seeded = await seedPermissions(
        aepbaseUrl,
        token,
        undefined,
        householdCollections(defs),
        householdApps(getAllApps()),
      );
      if (seeded.rolesSeeded || seeded.groupsSeeded || seeded.rolesReconciled.length) {
        log.child('permissions').info('seeded baseline', {
          roles: seeded.rolesSeeded,
          groups: seeded.groupsSeeded,
          reconciled: seeded.rolesReconciled,
        });
      }
    } catch (error) {
      log.child('permissions').error('baseline seed failed', { err: error });
    }

    // Fail operations orphaned by a restart (must run after the `operations`
    // table exists, i.e. after the resource sync above).
    try {
      const swept = await sweepStaleOperations({ aepbaseUrl, token });
      if (swept > 0) {
        log.child('operations').info('marked interrupted operation(s) as failed', {
          count: swept,
        });
      }
    } catch (error) {
      log.child('operations').error('stale-operation sweep failed', { err: error });
    }

    try {
      const result = await syncAppFlagsSchema({
        aepbaseUrl,
        token,
        defs: getAllAppFlagDefs() as never,
        authorizedDrops: authorizedDrops.get('app-flag'),
      });
      if (result.action === 'noop') log.child('app-flags').info('schema already in sync');
    } catch (error) {
      log.child('app-flags').error('schema sync failed', { err: error });
    }

    try {
      const result = await syncUserSettingsSchema({
        aepbaseUrl,
        token,
        defs: getAllUserSettingDefs() as never,
        authorizedDrops: authorizedDrops.get('user-preference'),
      });
      if (result.action === 'noop') log.child('user-settings').info('schema already in sync');
    } catch (error) {
      log.child('user-settings').error('schema sync failed', { err: error });
    }

    // Encrypted fields refuse writes without a master key: say so now, by
    // name, rather than leave it to the first failed save.
    const keyless = fieldsNeedingMasterKey(db);
    if (keyless.length > 0) log.child('encryption').warn(missingMasterKeyWarning(keyless));
  } finally {
    admin.revoke();
  }
}
