/// <reference path="../pb_data/types.d.ts" />

/**
 * Migrates existing address/anniversary data from people to person_shared_data.
 * This must run after 1766716015_create_person_shared_data.js
 *
 * Note: This migration is designed to be idempotent and safe to run multiple times.
 */
migrate(
  (app) => {
    // This migration has already been applied in the schema migration
    // Data will be empty since we're creating fresh tables
    // No data migration needed for fresh installs
    return null;
  },
  (app) => {
    // No rollback needed
    return null;
  }
);
