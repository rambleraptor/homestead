/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Get the required collection IDs
  const usersCollection = app.findCollectionByNameOrId("users");
  const giftCardsCollection = app.findCollectionByNameOrId("gift_cards");

  const collection = new Collection({
    "name": "gift_card_transactions",
    "type": "base",
    "system": false,
    "fields": [
      {
        "name": "gift_card",
        "type": "relation",
        "required": true,
        "presentable": false,
        "collectionId": giftCardsCollection.id,
        "cascadeDelete": true,
        "maxSelect": 1
      },
      {
        "name": "transaction_type",
        "type": "select",
        "required": true,
        "presentable": false,
        "values": ["decrement", "set"]
      },
      {
        "name": "previous_amount",
        "type": "number",
        "required": true,
        "presentable": false,
        "min": 0
      },
      {
        "name": "new_amount",
        "type": "number",
        "required": true,
        "presentable": false,
        "min": 0
      },
      {
        "name": "amount_changed",
        "type": "number",
        "required": true,
        "presentable": false
      },
      {
        "name": "notes",
        "type": "text",
        "required": false,
        "presentable": false,
        "max": 500
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
      "CREATE INDEX idx_gift_card ON gift_card_transactions (gift_card)",
      "CREATE INDEX idx_created ON gift_card_transactions (created)",
      "CREATE INDEX idx_created_by ON gift_card_transactions (created_by)"
    ],
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": "@request.auth.id != ''",
    "updateRule": null,
    "deleteRule": "@request.auth.id != '' && (created_by = @request.auth.id || @request.auth.role = 'admin')"
  });

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("gift_card_transactions");
  app.delete(collection);
});
