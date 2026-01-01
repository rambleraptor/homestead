/// <reference path="../pb_data/types.d.ts" />

/**
 * Enables multiple addresses per person/couple by changing address_id
 * from single-select (maxSelect: 1) to multi-select (maxSelect: null).
 *
 * This allows people to have multiple addresses (home, work, vacation home, etc.)
 */
migrate(
  (app) => {
    const addressesCollection = app.findCollectionByNameOrId('addresses');
    const sharedDataCollection = app.findCollectionByNameOrId('person_shared_data');

    // Remove old address_id field (single select)
    const oldAddressIdField = sharedDataCollection.fields.getByName('address_id');
    if (oldAddressIdField) {
      sharedDataCollection.fields.removeById(oldAddressIdField.id);
    }

    // Add new address_id field with multi-select enabled
    sharedDataCollection.fields.add(
      new RelationField({
        name: 'address_id',
        required: false,
        collectionId: addressesCollection.id,
        cascadeDelete: false, // Don't delete addresses if shared data is deleted
        maxSelect: null, // Allow multiple addresses (no limit)
      })
    );

    return app.save(sharedDataCollection);
  },
  (app) => {
    // Rollback: Change address_id back to single-select
    const addressesCollection = app.findCollectionByNameOrId('addresses');
    const sharedDataCollection = app.findCollectionByNameOrId('person_shared_data');

    // Remove multi-select address_id field
    const multiAddressIdField = sharedDataCollection.fields.getByName('address_id');
    if (multiAddressIdField) {
      sharedDataCollection.fields.removeById(multiAddressIdField.id);
    }

    // Restore single-select address_id field
    sharedDataCollection.fields.add(
      new RelationField({
        name: 'address_id',
        required: false,
        collectionId: addressesCollection.id,
        cascadeDelete: false,
        maxSelect: 1, // Single address only
      })
    );

    return app.save(sharedDataCollection);
  }
);
