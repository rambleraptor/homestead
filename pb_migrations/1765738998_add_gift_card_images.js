/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("gift_cards");

  // Add front_image field (file field)
  collection.fields.addAt(5, new Field({
    "name": "front_image",
    "type": "file",
    "required": false,
    "presentable": false,
    "maxSelect": 1,
    "maxSize": 5242880, // 5MB
    "mimeTypes": [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ],
    "thumbs": [
      "100x100",
      "400x400"
    ]
  }));

  // Add back_image field (file field)
  collection.fields.addAt(6, new Field({
    "name": "back_image",
    "type": "file",
    "required": false,
    "presentable": false,
    "maxSelect": 1,
    "maxSize": 5242880, // 5MB
    "mimeTypes": [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ],
    "thumbs": [
      "100x100",
      "400x400"
    ]
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("gift_cards");

  // Remove the fields in reverse order
  collection.fields.removeById(collection.fields.getByName("back_image").id);
  collection.fields.removeById(collection.fields.getByName("front_image").id);

  return app.save(collection);
});
