/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds `created` / `updated` autodate fields to collections that are missing them.
 *
 * Several collections were created without explicit autodate fields, which causes
 * `sort=-created` queries from the frontend to fail with a 400 response.
 * The affected user-visible pages include credit cards and notifications.
 */
migrate(
  (app) => {
    const collections = [
      "credit_cards",
      "credit_card_perks",
      "perk_redemptions",
      "notifications",
      "recurring_notifications",
    ];

    for (const name of collections) {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(name);
      } catch (e) {
        continue;
      }

      if (!collection.fields.getByName("created")) {
        collection.fields.add(
          new AutodateField({
            name: "created",
            onCreate: true,
            onUpdate: false,
          })
        );
      }

      if (!collection.fields.getByName("updated")) {
        collection.fields.add(
          new AutodateField({
            name: "updated",
            onCreate: true,
            onUpdate: true,
          })
        );
      }

      app.save(collection);
    }
  },
  (app) => {
    // No rollback - autodate fields are safe to leave in place.
  }
);
