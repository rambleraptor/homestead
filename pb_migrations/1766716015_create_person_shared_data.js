/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates the 'person_shared_data' collection for shared relationship data.
 * This table stores data shared between partners (or individual person data).
 * - person_a_id: Primary person (required)
 * - person_b_id: Partner person (nullable, for relationships)
 * - address: Shared address
 * - anniversary: Shared anniversary date
 */
migrate(
  (app) => {
    const peopleCollection = app.findCollectionByNameOrId('people');
    const usersCollection = app.findCollectionByNameOrId('users');

    // Create person_shared_data collection
    const sharedDataCollection = new Collection({
      name: 'person_shared_data',
      type: 'base',
      system: false,
      listRule: '@request.auth.id != "" && (person_a.created_by = @request.auth.id || person_b.created_by = @request.auth.id)',
      viewRule: '@request.auth.id != "" && (person_a.created_by = @request.auth.id || person_b.created_by = @request.auth.id)',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && (person_a.created_by = @request.auth.id || person_b.created_by = @request.auth.id)',
      deleteRule: '@request.auth.id != "" && (person_a.created_by = @request.auth.id || person_b.created_by = @request.auth.id)',
    });

    // Add person_a_id field (required)
    sharedDataCollection.fields.add(
      new RelationField({
        name: 'person_a',
        required: true,
        collectionId: peopleCollection.id,
        cascadeDelete: true,
        maxSelect: 1,
      })
    );

    // Add person_b_id field (optional, for partners)
    sharedDataCollection.fields.add(
      new RelationField({
        name: 'person_b',
        required: false,
        collectionId: peopleCollection.id,
        cascadeDelete: true,
        maxSelect: 1,
      })
    );

    // Add address field
    sharedDataCollection.fields.add(
      new TextField({
        name: 'address',
        required: false,
        max: 500,
      })
    );

    // Add anniversary field
    sharedDataCollection.fields.add(
      new DateField({
        name: 'anniversary',
        required: false,
      })
    );

    // Add created_by for access control
    sharedDataCollection.fields.add(
      new RelationField({
        name: 'created_by',
        required: true,
        collectionId: usersCollection.id,
        cascadeDelete: true,
      })
    );

    // Add indexes
    sharedDataCollection.indexes = [
      'CREATE INDEX IF NOT EXISTS idx_shared_data_person_a ON person_shared_data (person_a)',
      'CREATE INDEX IF NOT EXISTS idx_shared_data_person_b ON person_shared_data (person_b)',
    ];

    app.save(sharedDataCollection);

    // Remove address, anniversary, and partner_id fields from people collection
    const addressField = peopleCollection.fields.getByName('address');
    if (addressField) {
      peopleCollection.fields.removeById(addressField.id);
    }

    const anniversaryField = peopleCollection.fields.getByName('anniversary');
    if (anniversaryField) {
      peopleCollection.fields.removeById(anniversaryField.id);
    }

    const partnerIdField = peopleCollection.fields.getByName('partner_id');
    if (partnerIdField) {
      peopleCollection.fields.removeById(partnerIdField.id);
    }

    // Remove partner_id index
    const updatedIndexes = peopleCollection.indexes.filter(
      idx => !idx.includes('idx_people_partner_id')
    );
    peopleCollection.indexes = updatedIndexes;

    return app.save(peopleCollection);
  },
  (app) => {
    // Rollback: Delete person_shared_data collection and restore fields to people
    const sharedDataCollection = app.findCollectionByNameOrId('person_shared_data');
    app.delete(sharedDataCollection);

    const peopleCollection = app.findCollectionByNameOrId('people');

    // Restore address field
    peopleCollection.fields.add(
      new TextField({
        name: 'address',
        required: false,
        max: 500,
      })
    );

    // Restore anniversary field
    peopleCollection.fields.add(
      new DateField({
        name: 'anniversary',
        required: false,
      })
    );

    // Restore partner_id field
    peopleCollection.fields.add(
      new RelationField({
        name: 'partner_id',
        required: false,
        collectionId: peopleCollection.id,
        cascadeDelete: true,
        maxSelect: 1,
      })
    );

    // Restore partner_id index
    peopleCollection.indexes.push(
      'CREATE INDEX IF NOT EXISTS idx_people_partner_id ON people (partner_id)'
    );

    return app.save(peopleCollection);
  }
);
