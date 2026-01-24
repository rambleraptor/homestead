/// <reference path="../pb_data/types.d.ts" />

/**
 * Fix notification_subscriptions collection to use proper Collection API format
 */
migrate((app) => {
  // Delete the old collection if it exists
  try {
    const oldCollection = app.findCollectionByNameOrId("notification_subscriptions");
    app.delete(oldCollection);
  } catch (e) {
    // Collection doesn't exist, continue
  }

  // Get the users collection
  const usersCollection = app.findCollectionByNameOrId("users");

  // Create the collection with proper Collection API
  const collection = new Collection({
    name: "notification_subscriptions",
    type: "base",
    system: false,
    listRule: "@request.auth.id != '' && user_id = @request.auth.id",
    viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user_id = @request.auth.id"
  });

  // Add fields using Collection API
  collection.fields.add(
    new RelationField({
      name: "user_id",
      required: true,
      collectionId: usersCollection.id,
      cascadeDelete: true,
      maxSelect: 1
    })
  );

  collection.fields.add(
    new JSONField({
      name: "subscription_data",
      required: true,
      maxSize: 5242880
    })
  );

  collection.fields.add(
    new BoolField({
      name: "enabled",
      required: false
    })
  );

  // Add indexes
  collection.indexes = [
    "CREATE INDEX idx_notification_subscriptions_user_id ON notification_subscriptions (user_id)",
    "CREATE UNIQUE INDEX idx_notification_subscriptions_user_subscription ON notification_subscriptions (user_id)"
  ];

  return app.save(collection);
}, (app) => {
  // Rollback: delete the collection
  const collection = app.findCollectionByNameOrId("notification_subscriptions");
  return app.delete(collection);
});
