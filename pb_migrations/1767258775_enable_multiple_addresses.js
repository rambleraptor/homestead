/// <reference path="../pb_data/types.d.ts" />

/**
 * Enables multiple addresses per person/couple by changing address_id
 * from single-select (maxSelect: 1) to multi-select (maxSelect: null).
 *
 * IMPORTANT: This migration changes the field type from single-select to multi-select.
 * PocketBase will automatically handle the data conversion:
 * - Existing single address_id values will be converted to single-item arrays
 * - Empty/null values will remain as empty arrays
 *
 * The frontend code has been updated to handle address_id as an array.
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
    // PocketBase will automatically convert existing data:
    // - "abc123" becomes ["abc123"]
    // - null/empty becomes []
    sharedDataCollection.fields.add(
      new RelationField({
        name: 'address_id',
        required: false,
        collectionId: addressesCollection.id,
        cascadeDelete: false,
        maxSelect: null, // Allow multiple addresses
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
    // PocketBase will automatically convert arrays back:
    // - ["abc123"] becomes "abc123"
    // - ["abc123", "def456"] becomes "abc123" (first item)
    // - [] becomes null/empty
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
