/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("groceries");

  // Check if store field already exists
  try {
    const existingField = collection.fields.getByName("store");
    if (existingField) {
      return; // Field already exists, skip addition
    }
  } catch (e) {
    // Field doesn't exist, continue with addition
  }

  // Add store relation field
  try {
    const storesCollection = app.findCollectionByNameOrId("stores");
    collection.fields.add(new RelationField({
      name: "store",
      required: false,
      presentable: false,
      collectionId: storesCollection.id,
      cascadeDelete: false,
      maxSelect: 1
    }));

    // Add index for store field
    collection.indexes = [
      "CREATE INDEX IF NOT EXISTS idx_groceries_category ON groceries (category)",
      "CREATE INDEX IF NOT EXISTS idx_groceries_checked ON groceries (checked)",
      "CREATE INDEX IF NOT EXISTS idx_groceries_created_by ON groceries (created_by)",
      "CREATE INDEX IF NOT EXISTS idx_groceries_store ON groceries (store)"
    ];

    return app.save(collection);
  } catch (e) {
    console.log("Stores collection not found, cannot add store relation to groceries");
    throw e;
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("groceries");

  // Remove store field
  const field = collection.fields.getByName("store");
  if (field) {
    collection.fields.removeById(field.id);

    // Restore original indexes
    collection.indexes = [
      "CREATE INDEX IF NOT EXISTS idx_groceries_category ON groceries (category)",
      "CREATE INDEX IF NOT EXISTS idx_groceries_checked ON groceries (checked)",
      "CREATE INDEX IF NOT EXISTS idx_groceries_created_by ON groceries (created_by)"
    ];

    return app.save(collection);
  }
});
