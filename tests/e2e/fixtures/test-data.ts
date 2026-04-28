/**
 * Test Data for E2E Tests
 *
 * Centralized test data definitions
 */

export const testUsers = {
  user1: {
    email: 'user1@test.local',
    password: 'TestPassword123!',
    passwordConfirm: 'TestPassword123!',
    name: 'Test User 1',
  },
  user2: {
    email: 'user2@test.local',
    password: 'TestPassword123!',
    passwordConfirm: 'TestPassword123!',
    name: 'Test User 2',
  },
};

export const testGiftCards = [
  {
    merchant: 'Amazon',
    card_number: '1234-5678-9012-3456',
    amount: 50.00,
    notes: 'Birthday gift',
  },
  {
    merchant: 'Starbucks',
    card_number: '2345-6789-0123-4567',
    amount: 25.00,
    notes: 'Coffee gift card',
  },
  {
    merchant: 'Target',
    card_number: '3456-7890-1234-5678',
    amount: 100.00,
    notes: 'Holiday shopping',
  },
  {
    merchant: 'Amazon',
    card_number: '4567-8901-2345-6789',
    amount: 30.00,
    notes: 'Another Amazon card',
  },
];

export const testPeople = [
  {
    name: 'John Smith',
    address: '123 Main St, Anytown, USA',
    birthday: '1990-01-15',
    anniversary: '2015-06-20',
  },
  {
    name: 'Jane Doe',
    address: '456 Oak Ave, Someplace, USA',
    birthday: '1992-03-22',
  },
  {
    name: 'Peter Jones',
    address: '789 Pine Ln, Elsewhere, USA',
    anniversary: '2010-09-05',
  },
];

export const testRecipes = [
  {
    title: 'Garlic Pasta',
    source_pointer: 'https://example.com/garlic-pasta',
    parsed_ingredients: [
      { item: 'spaghetti', qty: 200, unit: 'g', raw: '200g spaghetti' },
      { item: 'garlic', qty: 4, unit: 'clove', raw: '4 cloves garlic' },
      { item: 'olive oil', qty: 3, unit: 'tbsp', raw: '3 tbsp olive oil' },
    ],
    method: '1. Boil pasta. 2. Sauté garlic in oil. 3. Toss together.',
    tags: ['dinner', 'vegetarian', 'pasta'],
  },
  {
    title: 'Oat Milk Latte',
    source_pointer: 'Book: Coffee Lab pg 42',
    parsed_ingredients: [
      { item: 'oat milk', qty: 1, unit: 'cup', raw: '1 cup oat milk' },
      { item: 'espresso', qty: 2, unit: 'shot', raw: '2 shots espresso' },
    ],
    method: '1. Steam oat milk. 2. Pull espresso. 3. Pour over.',
    tags: ['drink', 'breakfast'],
  },
];

/**
 * Test HSA receipts
 */
export const testHSAReceipts = [
  {
    merchant: 'CVS Pharmacy',
    service_date: '2024-01-15',
    amount: 45.99,
    category: 'Rx' as const,
    patient: 'Self',
    status: 'Stored' as const,
    notes: 'Prescription refill',
  },
  {
    merchant: 'Dr. Smith Dental',
    service_date: '2024-02-20',
    amount: 250.00,
    category: 'Dental' as const,
    patient: 'Child',
    status: 'Stored' as const,
    notes: 'Cavity filling',
  },
  {
    merchant: 'Vision Center',
    service_date: '2024-03-10',
    amount: 150.00,
    category: 'Vision' as const,
    patient: 'Spouse',
    status: 'Stored' as const,
    notes: 'Eye exam and glasses',
  },
  {
    merchant: 'ABC Medical Clinic',
    service_date: '2024-01-05',
    amount: 125.00,
    category: 'Medical' as const,
    patient: 'Self',
    status: 'Reimbursed' as const,
    notes: 'Annual checkup',
  },
];

/**
 * Test CSV data for people bulk import
 */
export const testBulkImportCSV = {
  // Basic import - name only
  basicImport: `name
Alice Johnson
Bob Williams
Carol Davis`,

  // Full data import with all fields
  fullDataImport: `name,address,wifi_network,wifi_password,birthday,anniversary,partner_name
John Smith,"123 Main St, Springfield, IL 62701",HomeNetwork,pass123,06/15/1985,08/20/2010,Jane Smith
Jane Smith,"123 Main St, Springfield, IL 62701",HomeNetwork,pass123,03/22/1987,08/20/2010,John Smith`,

  // Partner import - two people linked
  partnerImport: `name,address,birthday,partner_name
Mike Brown,456 Oak Ave,1990-01-15,Sarah Brown
Sarah Brown,456 Oak Ave,1992-05-20,Mike Brown`,

  // WiFi info import
  wifiInfoImport: `name,address,wifi_network,wifi_password
David Lee,111 Tech Blvd,OfficeWiFi,secure123
Lisa Chen,222 Innovation Dr,HomeNet,mypassword`,

  // Mixed valid/invalid rows
  mixedValidInvalid: `name,birthday,address
Valid Person,1990-05-15,123 Good St
,1985-01-01,Missing Name Street
Another Valid,1988-12-25,456 Nice Ave
Person Too Long Name ${'X'.repeat(200)},1980-06-30,Invalid Name`,

  // Validation errors - 1 valid (just name), 2 invalid (empty name, invalid date)
  validationErrors: `name,birthday,anniversary
Valid Person Only,,
,1985-01-01,
Person With Bad Date,invalid-date,`,
};

