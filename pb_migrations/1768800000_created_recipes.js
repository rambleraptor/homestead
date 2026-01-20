/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("recipes");
    if (existing) {
      return; // Collection already exists, skip creation
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "recipes";
  collection.type = "base";
  collection.system = false;

  // Add fields using typed field constructors
  collection.fields.add(new TextField({
    name: "title",
    required: true,
    presentable: true,
    max: 300
  }));

  collection.fields.add(new SelectField({
    name: "source_type",
    required: true,
    presentable: false,
    values: ["digital", "physical", "family"],
    maxSelect: 1
  }));

  collection.fields.add(new TextField({
    name: "source_reference",
    required: false,
    presentable: false,
    max: 1000
  }));

  collection.fields.add(new JSONField({
    name: "ingredients",
    required: false,
    presentable: false
  }));

  collection.fields.add(new EditorField({
    name: "instructions",
    required: false,
    presentable: false
  }));

  collection.fields.add(new NumberField({
    name: "version",
    required: true,
    presentable: false,
    min: 1
  }));

  collection.fields.add(new JSONField({
    name: "changelog",
    required: false,
    presentable: false
  }));

  collection.fields.add(new DateField({
    name: "last_cooked",
    required: false,
    presentable: false
  }));

  collection.fields.add(new NumberField({
    name: "rating",
    required: false,
    presentable: false,
    min: 1,
    max: 10
  }));

  collection.fields.add(new FileField({
    name: "image",
    required: false,
    presentable: false,
    maxSelect: 1,
    maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"]
  }));

  // Add created_by relation if users collection exists
  try {
    const usersCollection = app.findCollectionByNameOrId("users");
    collection.fields.add(new RelationField({
      name: "created_by",
      required: false,
      presentable: false,
      collectionId: usersCollection.id,
      cascadeDelete: false,
      maxSelect: 1
    }));
  } catch (e) {
    console.log("Users collection not found, creating recipes without user relation");
  }

  // Set indexes
  collection.indexes = [
    "CREATE INDEX IF NOT EXISTS idx_recipes_source_type ON recipes (source_type)",
    "CREATE INDEX IF NOT EXISTS idx_recipes_rating ON recipes (rating)",
    "CREATE INDEX IF NOT EXISTS idx_recipes_last_cooked ON recipes (last_cooked)",
    "CREATE INDEX IF NOT EXISTS idx_recipes_created_by ON recipes (created_by)"
  ];

  // Set rules - all authenticated users can manage recipes
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("recipes");
  app.delete(collection);
});
