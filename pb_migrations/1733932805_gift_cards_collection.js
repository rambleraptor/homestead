/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("gift_cards");
    if (existing) {
      return; // Collection already exists, skip creation
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "gift_cards";
  collection.type = "base";
  collection.system = false;

  // Add fields using typed field constructors
  collection.fields.add(new TextField({
    name: "merchant",
    required: true,
    presentable: false,
    max: 200
  }));

  collection.fields.add(new TextField({
    name: "card_number",
    required: true,
    presentable: false,
    max: 100
  }));

  collection.fields.add(new TextField({
    name: "pin",
    required: false,
    presentable: false,
    max: 50
  }));

  collection.fields.add(new NumberField({
    name: "amount",
    required: true,
    presentable: false,
    min: 0
  }));

  collection.fields.add(new TextField({
    name: "notes",
    required: false,
    presentable: false,
    max: 1000
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
    console.log("Users collection not found, creating gift_cards without user relation");
  }

  // Set indexes
  collection.indexes = [
    "CREATE INDEX IF NOT EXISTS idx_gift_cards_merchant ON gift_cards (merchant)",
    "CREATE INDEX IF NOT EXISTS idx_gift_cards_created_by ON gift_cards (created_by)"
  ];

  // Set rules
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')";
  collection.deleteRule = "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("gift_cards");
  app.delete(collection);
});
