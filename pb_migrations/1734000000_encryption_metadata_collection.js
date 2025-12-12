/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "encryption_metadata",
    "name": "encryption_metadata",
    "type": "base",
    "system": false,
    "schema": [
      {
        "id": "public_key",
        "name": "public_key",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "id": "encrypted_private_key",
        "name": "encrypted_private_key",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "id": "password_hash",
        "name": "password_hash",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      }
    ],
    "indexes": [],
    // Only authenticated users can access encryption metadata
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    // Only admins can create the initial encryption setup (should only be one record)
    "createRule": "@request.auth.role = 'admin'",
    // Only admins can update (for password changes)
    "updateRule": "@request.auth.role = 'admin'",
    // Prevent deletion to avoid losing encryption keys
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("encryption_metadata");
  return dao.deleteCollection(collection);
});
