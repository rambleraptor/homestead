/// <reference path="../pb_data/types.d.ts" />

/**
 * Add map_provider field to users collection
 *
 * Allows users to choose their preferred map provider (google or apple)
 * Defaults to 'google' for existing users
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  // Add map_provider field with default value "google"
  collection.fields.add(new TextField({
    name: "map_provider",
    required: false,
    max: 10,
    pattern: "^(google|apple)$"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("users");

  // Remove the map_provider field
  const field = collection.fields.getByName("map_provider");
  if (field) {
    collection.fields.removeById(field.id);
  }

  return app.save(collection);
});
