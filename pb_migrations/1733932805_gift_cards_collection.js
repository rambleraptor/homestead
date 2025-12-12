/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Get the users collection ID
  const usersCollection = app.findCollectionByNameOrId("users");

  const collection = new Collection({
    "name": "gift_cards",
    "type": "base",
    "system": false,
    "fields": [
      {
        "name": "merchant",
        "type": "text",
        "required": true,
        "presentable": false,
        "max": 200
      },
      {
        "name": "card_number",
        "type": "text",
        "required": true,
        "presentable": false,
        "max": 100
      },
      {
        "name": "pin",
        "type": "text",
        "required": false,
        "presentable": false,
        "max": 50
      },
      {
        "name": "amount",
        "type": "number",
        "required": true,
        "presentable": false,
        "min": 0
      },
      {
        "name": "notes",
        "type": "text",
        "required": false,
        "presentable": false,
        "max": 1000
      },
      {
        "name": "created_by",
        "type": "relation",
        "required": false,
        "presentable": false,
        "collectionId": usersCollection.id,
        "cascadeDelete": false,
        "maxSelect": 1
      }
    ],
    "indexes": [
      "CREATE INDEX idx_merchant ON gift_cards (merchant)",
      "CREATE INDEX idx_created_by ON gift_cards (created_by)"
    ],
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')",
    "deleteRule": "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')"
  });

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("gift_cards");
  app.delete(collection);
});
