/// <reference path="../pb_data/types.d.ts" />

/**
 * Consolidates address fields from separate components (line1, line2, city, state, postal_code, country)
 * into a single 'address' text field. WiFi fields (wifi_network, wifi_password) remain unchanged.
 *
 * Fields removed:
 * - line1, line2, city, state, postal_code, country
 *
 * Fields added:
 * - address (single text field, required)
 */
migrate(
  (app) => {
    const addressesCollection = app.findCollectionByNameOrId('addresses');

    // Remove old separate address fields
    const fieldsToRemove = ['line1', 'line2', 'city', 'state', 'postal_code', 'country'];

    for (const fieldName of fieldsToRemove) {
      const field = addressesCollection.fields.getByName(fieldName);
      if (field) {
        addressesCollection.fields.removeById(field.id);
      }
    }

    // Add single address field
    addressesCollection.fields.add(
      new TextField({
        name: 'address',
        required: true,
        max: 1000,
      })
    );

    return app.save(addressesCollection);
  },
  (app) => {
    // Rollback: Restore separate address fields and remove single address field
    const addressesCollection = app.findCollectionByNameOrId('addresses');

    // Remove single address field
    const addressField = addressesCollection.fields.getByName('address');
    if (addressField) {
      addressesCollection.fields.removeById(addressField.id);
    }

    // Restore separate address fields
    addressesCollection.fields.add(
      new TextField({
        name: 'line1',
        required: true,
        max: 255,
      })
    );

    addressesCollection.fields.add(
      new TextField({
        name: 'line2',
        required: false,
        max: 255,
      })
    );

    addressesCollection.fields.add(
      new TextField({
        name: 'city',
        required: false,
        max: 100,
      })
    );

    addressesCollection.fields.add(
      new TextField({
        name: 'state',
        required: false,
        max: 100,
      })
    );

    addressesCollection.fields.add(
      new TextField({
        name: 'postal_code',
        required: false,
        max: 20,
      })
    );

    addressesCollection.fields.add(
      new TextField({
        name: 'country',
        required: false,
        max: 100,
      })
    );

    return app.save(addressesCollection);
  }
);
