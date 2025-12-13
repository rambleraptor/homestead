/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gift_cards")

  // Add archived field (boolean, default false)
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "archived",
    "name": "archived",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gift_cards")

  // Remove archived field
  collection.schema.removeField("archived")

  return dao.saveCollection(collection)
})
