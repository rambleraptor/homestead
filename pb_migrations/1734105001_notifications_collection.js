/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Get the users and events collection IDs
  const usersCollection = app.findCollectionByNameOrId("users");
  const eventsCollection = app.findCollectionByNameOrId("events");

  const collection = new Collection({
    "name": "notifications",
    "type": "base",
    "system": false,
    "fields": [
      {
        "name": "user_id",
        "type": "relation",
        "required": true,
        "presentable": false,
        "collectionId": usersCollection.id,
        "cascadeDelete": true,
        "maxSelect": 1
      },
      {
        "name": "event_id",
        "type": "relation",
        "required": false,
        "presentable": false,
        "collectionId": eventsCollection.id,
        "cascadeDelete": true,
        "maxSelect": 1
      },
      {
        "name": "title",
        "type": "text",
        "required": true,
        "presentable": true,
        "max": 200
      },
      {
        "name": "message",
        "type": "text",
        "required": true,
        "presentable": false,
        "max": 1000
      },
      {
        "name": "notification_type",
        "type": "select",
        "required": true,
        "presentable": false,
        "options": {
          "values": ["day_of", "day_before", "week_before", "system"]
        }
      },
      {
        "name": "scheduled_for",
        "type": "date",
        "required": false,
        "presentable": false
      },
      {
        "name": "sent_at",
        "type": "date",
        "required": false,
        "presentable": false
      },
      {
        "name": "read",
        "type": "bool",
        "required": false,
        "presentable": false
      },
      {
        "name": "read_at",
        "type": "date",
        "required": false,
        "presentable": false
      }
    ],
    "indexes": [
      "CREATE INDEX idx_user_id ON notifications (user_id)",
      "CREATE INDEX idx_event_id ON notifications (event_id)",
      "CREATE INDEX idx_read ON notifications (read)",
      "CREATE INDEX idx_scheduled_for ON notifications (scheduled_for)"
    ],
    "listRule": "@request.auth.id != '' && user_id = @request.auth.id",
    "viewRule": "@request.auth.id != '' && user_id = @request.auth.id",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != '' && user_id = @request.auth.id",
    "deleteRule": "@request.auth.id != '' && user_id = @request.auth.id"
  });

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("notifications");
  app.delete(collection);
});
