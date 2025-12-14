/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("gift_cards");

  // Add front_image field (file field)
  collection.fields.add(new FileField({
    name: "front_image",
    required: false,
    presentable: false,
    maxSelect: 1,
    maxSize: 5242880, // 5MB
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ],
    thumbs: [
      "100x100",
      "400x400"
    ]
  }));

  // Add back_image field (file field)
  collection.fields.add(new FileField({
    name: "back_image",
    required: false,
    presentable: false,
    maxSelect: 1,
    maxSize: 5242880, // 5MB
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ],
    thumbs: [
      "100x100",
      "400x400"
    ]
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("gift_cards");

  // Remove the fields in reverse order
  const backImageField = collection.fields.getByName("back_image");
  if (backImageField) {
    collection.fields.removeById(backImageField.id);
  }

  const frontImageField = collection.fields.getByName("front_image");
  if (frontImageField) {
    collection.fields.removeById(frontImageField.id);
  }

  return app.save(collection);
});
