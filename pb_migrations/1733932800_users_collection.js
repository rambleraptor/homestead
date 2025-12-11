/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_");

  // Add custom fields to the users collection
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "name_field",
    "name": "name",
    "type": "text",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "min": 1,
      "max": 100,
      "pattern": ""
    }
  }));

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "avatar_field",
    "name": "avatar",
    "type": "file",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "maxSize": 5242880,
      "mimeTypes": [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp"
      ],
      "thumbs": [],
      "protected": false
    }
  }));

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "role_field",
    "name": "role",
    "type": "select",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "admin",
        "member",
        "viewonly"
      ]
    }
  }));

  // Update collection rules
  collection.listRule = "@request.auth.id != \"\"";
  collection.viewRule = "@request.auth.id != \"\" && (id = @request.auth.id || @request.auth.role = \"admin\")";
  collection.createRule = "@request.auth.role = \"admin\"";
  collection.updateRule = "@request.auth.id = id || @request.auth.role = \"admin\"";
  collection.deleteRule = "@request.auth.role = \"admin\"";

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_");

  // Remove custom fields
  collection.schema.removeField("name_field");
  collection.schema.removeField("avatar_field");
  collection.schema.removeField("role_field");

  // Reset rules to defaults
  collection.listRule = null;
  collection.viewRule = null;
  collection.createRule = null;
  collection.updateRule = null;
  collection.deleteRule = null;

  return dao.saveCollection(collection);
});
