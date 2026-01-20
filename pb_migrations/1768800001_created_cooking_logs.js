/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("cooking_logs");
    if (existing) {
      return; // Collection already exists, skip creation
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "cooking_logs";
  collection.type = "base";
  collection.system = false;

  // Add relation to recipes collection
  try {
    const recipesCollection = app.findCollectionByNameOrId("recipes");
    collection.fields.add(new RelationField({
      name: "recipe",
      required: true,
      presentable: true,
      collectionId: recipesCollection.id,
      cascadeDelete: true,
      maxSelect: 1
    }));
  } catch (e) {
    console.log("Recipes collection not found, cannot create cooking_logs");
    throw new Error("Recipes collection must exist before creating cooking_logs");
  }

  collection.fields.add(new DateField({
    name: "date",
    required: true,
    presentable: false
  }));

  collection.fields.add(new TextField({
    name: "notes",
    required: false,
    presentable: false,
    max: 2000
  }));

  collection.fields.add(new BoolField({
    name: "success",
    required: false,
    presentable: false
  }));

  collection.fields.add(new NumberField({
    name: "rating",
    required: false,
    presentable: false,
    min: 1,
    max: 5
  }));

  collection.fields.add(new BoolField({
    name: "deviated",
    required: false,
    presentable: false
  }));

  collection.fields.add(new TextField({
    name: "deviation_notes",
    required: false,
    presentable: false,
    max: 2000
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
    console.log("Users collection not found, creating cooking_logs without user relation");
  }

  // Set indexes
  collection.indexes = [
    "CREATE INDEX IF NOT EXISTS idx_cooking_logs_recipe ON cooking_logs (recipe)",
    "CREATE INDEX IF NOT EXISTS idx_cooking_logs_date ON cooking_logs (date)",
    "CREATE INDEX IF NOT EXISTS idx_cooking_logs_success ON cooking_logs (success)",
    "CREATE INDEX IF NOT EXISTS idx_cooking_logs_created_by ON cooking_logs (created_by)"
  ];

  // Set rules - all authenticated users can manage cooking logs
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("cooking_logs");
  app.delete(collection);
});
