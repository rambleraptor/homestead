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

/**
 * Test grocery items
 */
export const testGroceryItems = [
  { name: 'Milk', notes: '2% organic', category: 'Dairy & Eggs' },
  { name: 'Apples', notes: 'Honeycrisp', category: 'Produce' },
  { name: 'Chicken Breast', notes: '2 lbs', category: 'Meat & Seafood' },
  { name: 'Bread', notes: 'Whole wheat', category: 'Bakery' },
  { name: 'Yogurt', notes: 'Greek yogurt', category: 'Dairy & Eggs' },
  { name: 'Bananas', category: 'Produce' },
  { name: 'Cereal', category: 'Pantry & Canned Goods' },
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
  fullDataImport: `name,address,wifi_network,wifi_password,birthday,anniversary,notification_preferences,partner_name
John Smith,"123 Main St, Springfield, IL 62701",HomeNetwork,pass123,06/15/1985,08/20/2010,"day_of,week_before",Jane Smith
Jane Smith,"123 Main St, Springfield, IL 62701",HomeNetwork,pass123,03/22/1987,08/20/2010,day_of,John Smith`,

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

