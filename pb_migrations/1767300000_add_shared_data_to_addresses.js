/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds shared_data_id field to addresses collection to support multiple addresses per person/couple.
 *
 * This enables a bidirectional relationship:
 * - person_shared_data.address_id -> primary address (existing, maxSelect: 1)
 * - addresses.shared_data_id -> person_shared_data (new, optional)
 *
 * When fetching addresses for a person:
 * 1. Get primary address via person_shared_data.address_id
 * 2. Get additional addresses where addresses.shared_data_id matches
 * 3. Combine into array
 *
 * This approach avoids complex data migration while supporting multiple addresses.
 */
migrate(
  (app) => {
    const addressesCollection = app.findCollectionByNameOrId('addresses');
    const sharedDataCollection = app.findCollectionByNameOrId('person_shared_data');

    // Add optional relation from addresses back to person_shared_data
    addressesCollection.fields.add(
      new RelationField({
        name: 'shared_data_id',
        required: false,
        collectionId: sharedDataCollection.id,
        cascadeDelete: true, // Delete address if shared data is deleted
        maxSelect: 1,
      })
    );

    // Add index for efficient lookups
    addressesCollection.indexes = [
      ...(addressesCollection.indexes || []),
      'CREATE INDEX IF NOT EXISTS idx_addresses_shared_data ON addresses (shared_data_id)',
    ];

    return app.save(addressesCollection);
  },
  (app) => {
    // Rollback: Remove shared_data_id field from addresses
    const addressesCollection = app.findCollectionByNameOrId('addresses');

    const sharedDataIdField = addressesCollection.fields.getByName('shared_data_id');
    if (sharedDataIdField) {
      addressesCollection.fields.removeById(sharedDataIdField.id);
    }

    // Remove index
    const updatedIndexes = addressesCollection.indexes.filter(
      idx => !idx.includes('idx_addresses_shared_data')
    );
    addressesCollection.indexes = updatedIndexes;

    return app.save(addressesCollection);
  }
);
