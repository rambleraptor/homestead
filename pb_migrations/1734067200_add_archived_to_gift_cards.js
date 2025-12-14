/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("gift_cards");

  // Add archived field (boolean, default false)
  collection.fields.add(new BoolField({
    name: "archived",
    required: false,
    presentable: false
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("gift_cards");

  // Remove archived field
  const archivedField = collection.fields.getByName("archived");
  if (archivedField) {
    collection.fields.removeById(archivedField.id);
  }

  return app.save(collection);
})
