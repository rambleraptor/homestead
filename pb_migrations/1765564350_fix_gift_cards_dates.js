/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // This migration ensures the gift_cards collection properly tracks created/updated timestamps
  // PocketBase automatically adds these fields to base collections, but we need to
  // ensure the collection is saved properly to activate them

  const collection = app.findCollectionByNameOrId("gift_cards");

  // Save the collection to ensure system fields (created, updated) are properly initialized
  return app.save(collection);
}, (app) => {
  // Rollback: no-op since we're just ensuring proper field initialization
});
