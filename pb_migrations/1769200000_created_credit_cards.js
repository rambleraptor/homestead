/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("credit_cards");
    if (existing) {
      return; // Collection already exists, skip creation
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "credit_cards";
  collection.type = "base";
  collection.system = false;

  collection.fields.add(new TextField({
    name: "name",
    required: true,
    presentable: true,
    max: 255
  }));

  collection.fields.add(new TextField({
    name: "issuer",
    required: true,
    presentable: false,
    max: 255
  }));

  collection.fields.add(new TextField({
    name: "last_four",
    required: false,
    presentable: false,
    max: 4
  }));

  collection.fields.add(new SelectField({
    name: "card_type",
    required: true,
    presentable: false,
    values: ["personal", "business"],
    maxSelect: 1
  }));

  collection.fields.add(new NumberField({
    name: "annual_fee",
    required: true,
    presentable: false,
    min: 0
  }));

  collection.fields.add(new DateField({
    name: "anniversary_date",
    required: true,
    presentable: false
  }));

  collection.fields.add(new SelectField({
    name: "reset_mode",
    required: true,
    presentable: false,
    values: ["calendar_year", "anniversary"],
    maxSelect: 1
  }));

  collection.fields.add(new TextField({
    name: "notes",
    required: false,
    presentable: false,
    max: 2000
  }));

  collection.fields.add(new BoolField({
    name: "archived",
    required: false
  }));

  // Add created_by relation
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
    console.log("Users collection not found, creating credit_cards without user relation");
  }

  // Set indexes
  collection.indexes = [
    "CREATE INDEX IF NOT EXISTS idx_credit_cards_created_by ON credit_cards (created_by)",
    "CREATE INDEX IF NOT EXISTS idx_credit_cards_archived ON credit_cards (archived)"
  ];

  // Set rules - all authenticated users can manage
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("credit_cards");
  app.delete(collection);
});
