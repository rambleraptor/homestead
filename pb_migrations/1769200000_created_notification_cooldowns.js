/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates the 'notification_cooldowns' collection.
 *
 * This collection tracks cooldown periods for different notification types
 * to prevent notification spam. When a notification is sent, the timestamp
 * is recorded. Subsequent events within the cooldown period are ignored.
 *
 * Fields:
 * - user_id: The user this cooldown applies to
 * - notification_type: Type of notification (e.g., "grocery_items_added")
 * - last_sent: When a notification was last sent for this type
 * - cooldown_minutes: How long to wait before sending another (default: 10)
 */
migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId('users');

    const collection = new Collection({
      name: 'notification_cooldowns',
      type: 'base',
      system: false,
      listRule: 'user_id = @request.auth.id',
      viewRule: 'user_id = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: 'user_id = @request.auth.id',
      deleteRule: 'user_id = @request.auth.id',
    });

    // User who owns this cooldown record
    collection.fields.add(
      new RelationField({
        name: 'user_id',
        required: true,
        collectionId: usersCollection.id,
        cascadeDelete: true,
        maxSelect: 1,
      })
    );

    // Type of notification (e.g., "grocery_items_added")
    collection.fields.add(
      new TextField({
        name: 'notification_type',
        required: true,
        max: 100,
      })
    );

    // When a notification was last sent for this type
    collection.fields.add(
      new DateField({
        name: 'last_sent',
        required: true,
      })
    );

    // Cooldown period in minutes (default handled in application code)
    collection.fields.add(
      new NumberField({
        name: 'cooldown_minutes',
        required: false,
        min: 1,
        max: 1440, // Max 24 hours
      })
    );

    // Add indexes for efficient querying
    collection.indexes = [
      'CREATE UNIQUE INDEX idx_notification_cooldowns_user_type ON notification_cooldowns (user_id, notification_type)',
    ];

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('notification_cooldowns');
    return app.delete(collection);
  }
);
