/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("events");
    if (existing) {
      return; // Collection already exists, skip creation
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "events";
  collection.type = "base";
  collection.system = false;

  // Add fields using typed field constructors
  collection.fields.add(new SelectField({
    name: "event_type",
    required: true,
    presentable: false,
    values: ["birthday", "anniversary"]
  }));

  collection.fields.add(new TextField({
    name: "title",
    required: true,
    presentable: true,
    max: 200
  }));

  collection.fields.add(new TextField({
    name: "people_involved",
    required: true,
    presentable: false,
    max: 500
  }));

  collection.fields.add(new DateField({
    name: "event_date",
    required: true,
    presentable: false
  }));

  collection.fields.add(new BoolField({
    name: "recurring_yearly",
    required: false,
    presentable: false
  }));

  collection.fields.add(new TextField({
    name: "details",
    required: false,
    presentable: false,
    max: 2000
  }));

  collection.fields.add(new JSONField({
    name: "notification_preferences",
    required: false,
    presentable: false
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
    console.log("Users collection not found, creating events without user relation");
  }

  // Set indexes
  collection.indexes = [
    "CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type)",
    "CREATE INDEX IF NOT EXISTS idx_events_event_date ON events (event_date)",
    "CREATE INDEX IF NOT EXISTS idx_events_created_by ON events (created_by)"
  ];

  // Set rules
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')";
  collection.deleteRule = "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("events");
  app.delete(collection);
});
