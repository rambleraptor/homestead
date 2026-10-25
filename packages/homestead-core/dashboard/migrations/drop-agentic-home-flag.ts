/**
 * `dashboard-drop-agentic-home-flag` migration.
 *
 * The assistant-first home was tried behind the `dashboard.agentic_home` flag
 * and is now the only home, so the flag is gone from the dashboard's config.
 * Its two columns on the `app-flag` singleton (the value and its audience)
 * still hold whatever was set, and the engine refuses to drop a populated
 * column unless a migration authorizes it — without this, the app-flags sync
 * would fail and no flag change from any app would apply. The authorization is
 * the `drops` declaration on the migration; there is no data to move, since
 * the home no longer reads the flag. Idempotent: it does nothing either way.
 *
 * Server-only: lives under `migrations/`, so vite stubs it out of the browser
 * bundle.
 */

import type { MigrationHandler } from '../../apps/migrations';

const migrate: MigrationHandler = async () => ({ retired: 'dashboard.agentic_home' });

export default migrate;
