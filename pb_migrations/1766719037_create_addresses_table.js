/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates the 'addresses' collection for storing physical addresses with WiFi information.
 * Addresses can be linked to person_shared_data for people.
 *
 * Fields:
 * - line1: Street address line 1 (required)
 * - line2: Street address line 2 (optional)
 * - city: City name (optional)
 * - state: State/province (optional)
 * - postal_code: ZIP/postal code (optional)
 * - country: Country name (optional)
 * - wifi_network: WiFi network name (optional)
 * - wifi_password: WiFi password (optional, encrypted at rest by PocketBase)
 * - created_by: User who created this address
 */
migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId('users');

    // Create addresses collection
    const addressesCollection = new Collection({
      name: 'addresses',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != "" && created_by = @request.auth.id',
      viewRule: '@request.auth.id != "" && created_by = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && created_by = @request.auth.id',
      deleteRule: '@request.auth.id != "" && created_by = @request.auth.id',
    });

    // Add line1 field (required)
    addressesCollection.fields.add(
      new TextField({
        name: 'line1',
        required: true,
        max: 255,
      })
    );

    // Add line2 field (optional)
    addressesCollection.fields.add(
      new TextField({
        name: 'line2',
        required: false,
        max: 255,
      })
    );

    // Add city field (optional)
    addressesCollection.fields.add(
      new TextField({
        name: 'city',
        required: false,
        max: 100,
      })
    );

    // Add state field (optional)
    addressesCollection.fields.add(
      new TextField({
        name: 'state',
        required: false,
        max: 100,
      })
    );

    // Add postal_code field (optional)
    addressesCollection.fields.add(
      new TextField({
        name: 'postal_code',
        required: false,
        max: 20,
      })
    );

    // Add country field (optional)
    addressesCollection.fields.add(
      new TextField({
        name: 'country',
        required: false,
        max: 100,
      })
    );

    // Add wifi_network field (optional)
    addressesCollection.fields.add(
      new TextField({
        name: 'wifi_network',
        required: false,
        max: 100,
      })
    );

    // Add wifi_password field (optional)
    addressesCollection.fields.add(
      new TextField({
        name: 'wifi_password',
        required: false,
        max: 255,
      })
    );

    // Add created_by for access control
    addressesCollection.fields.add(
      new RelationField({
        name: 'created_by',
        required: true,
        collectionId: usersCollection.id,
        cascadeDelete: true,
      })
    );

    app.save(addressesCollection);

    // Update person_shared_data to link to addresses instead of storing address as text
    const sharedDataCollection = app.findCollectionByNameOrId('person_shared_data');

    // Remove old text address field
    const oldAddressField = sharedDataCollection.fields.getByName('address');
    if (oldAddressField) {
      sharedDataCollection.fields.removeById(oldAddressField.id);
    }

    // Add address_id relation field
    sharedDataCollection.fields.add(
      new RelationField({
        name: 'address_id',
        required: false,
        collectionId: addressesCollection.id,
        cascadeDelete: false, // Don't delete address if shared data is deleted
        maxSelect: 1,
      })
    );

    // Add index for address lookups
    sharedDataCollection.indexes = [
      ...(sharedDataCollection.indexes || []),
      'CREATE INDEX IF NOT EXISTS idx_shared_data_address ON person_shared_data (address_id)',
    ];

    return app.save(sharedDataCollection);
  },
  (app) => {
    // Rollback: Delete addresses collection and restore text address field
    const addressesCollection = app.findCollectionByNameOrId('addresses');
    app.delete(addressesCollection);

    const sharedDataCollection = app.findCollectionByNameOrId('person_shared_data');

    // Remove address_id relation field
    const addressIdField = sharedDataCollection.fields.getByName('address_id');
    if (addressIdField) {
      sharedDataCollection.fields.removeById(addressIdField.id);
    }

    // Restore text address field
    sharedDataCollection.fields.add(
      new TextField({
        name: 'address',
        required: false,
        max: 500,
      })
    );

    // Remove address index
    const updatedIndexes = sharedDataCollection.indexes.filter(
      idx => !idx.includes('idx_shared_data_address')
    );
    sharedDataCollection.indexes = updatedIndexes;

    return app.save(sharedDataCollection);
  }
);
