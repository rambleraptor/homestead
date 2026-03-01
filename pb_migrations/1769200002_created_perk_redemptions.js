/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("perk_redemptions");
    if (existing) {
      return;
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "perk_redemptions";
  collection.type = "base";
  collection.system = false;

  // Relation to credit_card_perks with cascade delete
  try {
    const perksCollection = app.findCollectionByNameOrId("credit_card_perks");
    collection.fields.add(new RelationField({
      name: "perk",
      required: true,
      presentable: false,
      collectionId: perksCollection.id,
      cascadeDelete: true,
      maxSelect: 1
    }));
  } catch (e) {
    console.log("credit_card_perks collection not found");
  }

  collection.fields.add(new DateField({
    name: "period_start",
    required: true,
    presentable: false
  }));

  collection.fields.add(new DateField({
    name: "period_end",
    required: true,
    presentable: false
  }));

  collection.fields.add(new DateField({
    name: "redeemed_at",
    required: true,
    presentable: false
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
    "CREATE INDEX IF NOT EXISTS idx_perk_redemptions_perk ON perk_redemptions (perk)",
    "CREATE INDEX IF NOT EXISTS idx_perk_redemptions_period ON perk_redemptions (period_start, period_end)",
    "CREATE INDEX IF NOT EXISTS idx_perk_redemptions_created_by ON perk_redemptions (created_by)"
  ];

  // Set rules
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("perk_redemptions");
  app.delete(collection);
});
