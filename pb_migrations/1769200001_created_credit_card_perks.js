/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("credit_card_perks");
    if (existing) {
      return;
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "credit_card_perks";
  collection.type = "base";
  collection.system = false;

  // Relation to credit_cards with cascade delete
  try {
    const creditCardsCollection = app.findCollectionByNameOrId("credit_cards");
    collection.fields.add(new RelationField({
      name: "credit_card",
      required: true,
      presentable: false,
      collectionId: creditCardsCollection.id,
      cascadeDelete: true,
      maxSelect: 1
    }));
  } catch (e) {
    console.log("credit_cards collection not found");
  }

  collection.fields.add(new TextField({
    name: "name",
    required: true,
    presentable: true,
    max: 255
  }));

  collection.fields.add(new NumberField({
    name: "value",
    required: true,
    presentable: false,
    min: 0
  }));

  collection.fields.add(new SelectField({
    name: "frequency",
    required: true,
    presentable: false,
    values: ["monthly", "quarterly", "semi_annual", "annual"],
    maxSelect: 1
  }));

  collection.fields.add(new SelectField({
    name: "category",
    required: false,
    presentable: false,
    values: ["travel", "dining", "streaming", "credits", "insurance", "lounge", "other"],
    maxSelect: 1
  }));

  collection.fields.add(new TextField({
    name: "notes",
    required: false,
    presentable: false,
    max: 2000
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
    console.log("Users collection not found");
  }

  // Set indexes
  collection.indexes = [
    "CREATE INDEX IF NOT EXISTS idx_credit_card_perks_card ON credit_card_perks (credit_card)",
    "CREATE INDEX IF NOT EXISTS idx_credit_card_perks_created_by ON credit_card_perks (created_by)"
  ];

  // Set rules
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("credit_card_perks");
  app.delete(collection);
});
