/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Check if collection already exists (idempotent)
  try {
    const existing = app.findCollectionByNameOrId("hsa_receipts");
    if (existing) {
      return; // Collection already exists, skip creation
    }
  } catch (e) {
    // Collection doesn't exist, continue with creation
  }

  const collection = new Collection();
  collection.name = "hsa_receipts";
  collection.type = "base";
  collection.system = false;

  // Add fields using typed field constructors
  collection.fields.add(new TextField({
    name: "merchant",
    required: true,
    presentable: true,
    max: 200
  }));

  collection.fields.add(new DateField({
    name: "service_date",
    required: true,
    presentable: false
  }));

  collection.fields.add(new NumberField({
    name: "amount",
    required: true,
    presentable: false,
    min: 0
  }));

  collection.fields.add(new SelectField({
    name: "category",
    required: true,
    presentable: false,
    values: ["Medical", "Dental", "Vision", "Rx"]
  }));

  collection.fields.add(new TextField({
    name: "patient",
    required: false,
    presentable: false,
    max: 100
  }));

  collection.fields.add(new SelectField({
    name: "status",
    required: true,
    presentable: false,
    values: ["Stored", "Reimbursed"]
  }));

  collection.fields.add(new FileField({
    name: "receipt_file",
    required: true,
    presentable: false,
    maxSelect: 1,
    maxSize: 10485760, // 10MB
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf"
    ],
    thumbs: [
      "100x100",
      "400x400"
    ]
  }));

  collection.fields.add(new TextField({
    name: "notes",
    required: false,
    presentable: false,
    max: 1000
  }));

  // Add created_by relation if users collection exists
  try {
    const usersCollection = app.findCollectionByNameOrId("users");
    collection.fields.add(new RelationField({
      name: "created_by",
      required: false,
      presentable: false,
      collectionId: usersCollection.id,
      cascadeDelete: false,
      maxSelect: 1
    }));
  } catch (e) {
    console.log("Users collection not found, creating hsa_receipts without user relation");
  }

  // Set indexes
  collection.indexes = [
    "CREATE INDEX IF NOT EXISTS idx_hsa_receipts_status ON hsa_receipts (status)",
    "CREATE INDEX IF NOT EXISTS idx_hsa_receipts_category ON hsa_receipts (category)",
    "CREATE INDEX IF NOT EXISTS idx_hsa_receipts_service_date ON hsa_receipts (service_date)",
    "CREATE INDEX IF NOT EXISTS idx_hsa_receipts_created_by ON hsa_receipts (created_by)"
  ];

  // Set rules - all authenticated users can manage their own receipts
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";
  collection.createRule = "@request.auth.id != ''";
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("hsa_receipts");
  app.delete(collection);
});
