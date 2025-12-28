/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("merchants");
    if (existing) {
      return; // Collection already exists, skip creation
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "merchants";
  collection.type = "base";
  collection.system = false;

  // Add fields using typed field constructors
  collection.fields.add(new TextField({
    name: "name",
    required: true,
    presentable: true,
    max: 200
  }));

  collection.fields.add(new TextField({
    name: "domain",
    required: false,
    presentable: false,
    max: 200
  }));

  collection.fields.add(new TextField({
    name: "logo_url",
    required: false,
    presentable: false,
    max: 500
  }));

  // Set indexes - ensure merchant names are unique per user
  collection.indexes = [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_name ON merchants (name)"
  ];

  // Set rules - authenticated users can read/create/update
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("merchants");
  app.delete(collection);
});
