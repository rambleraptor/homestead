/// <reference path="../pb_data/types.d.ts" />

/**
 * Relax events collection API rules to allow family members to manage each other's events
 *
 * Changes:
 * - Update rule: Any authenticated user can update events (family OS concept)
 * - Delete rule: Any authenticated user can delete events (family OS concept)
 *
 * This fixes the issue where @request.auth.role doesn't exist in PocketBase's standard auth model.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("events");

  // Allow any authenticated user to update/delete (family OS concept)
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("events");

  // Revert to restrictive rules (even though they don't work)
  collection.updateRule = "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')";
  collection.deleteRule = "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')";

  return app.save(collection);
});
