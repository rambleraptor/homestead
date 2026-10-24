/**
 * People Bulk Import, on the VM tier.
 *
 * A port of ../e2e/people-bulk-import.spec.ts: the bulk CSV import flow for
 * people. Each test boots from a fresh copy of the template database, so
 * there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient, listOrEmpty } from '../../../../tests/e2e/utils/aepbase-helpers';
import { PeoplePage } from '../e2e/PeoplePage';
import { getPersonSharedData, listRelationships, testBulkImportCSV } from '../e2e/helpers';

interface PersonRow {
  id: string;
  name: string;
}

interface AddressRow {
  id: string;
  line1: string;
  wifi_network?: string;
  wifi_password?: string;
}

describe('People Bulk Import', () => {
  let h: Harness;
  let peoplePage: PeoplePage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    peoplePage = new PeoplePage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('should import people with basic data (name only)', async () => {
    await peoplePage.gotoBulkImport();

    // Upload CSV with basic data
    await peoplePage.uploadCSVContent(testBulkImportCSV.basicImport);

    // Wait for stats to appear and verify count (UI shows "Valid People" from appName)
    await h.driver.expect(h.driver.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });
    await h.driver.expect(h.driver.getByText('3', { exact: true }).first()).toBeVisible();

    // Importable items are pre-selected by the preview.
    // Wait for the import button to be enabled with the correct count
    await h.driver.expect(h.driver.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
    await h.driver.expect(h.driver.getByTestId('import-button')).toContainText('Import 3 People');

    // Click the import button (which shows selected count)
    await h.driver.getByTestId('import-button').click();

    // Wait for redirect to people page
    await h.driver.waitForURL(/\/people$/);

    // Verify people are in list
    await peoplePage.expectPersonInList('Alice Johnson');
    await peoplePage.expectPersonInList('Bob Williams');
    await peoplePage.expectPersonInList('Carol Davis');
  });

  test('should import people with full data', async () => {
    await peoplePage.gotoBulkImport();

    // Upload CSV with full data
    await peoplePage.uploadCSVContent(testBulkImportCSV.fullDataImport);

    // Wait for stats to appear
    await h.driver.expect(h.driver.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

    // Items are auto-selected on upload, import directly
    await h.driver.expect(h.driver.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
    await h.driver.getByTestId('import-button').click();

    // Wait for redirect
    await h.driver.waitForURL(/\/people$/);

    // Verify people are in list
    await peoplePage.expectPersonInList('John Smith');
    await peoplePage.expectPersonInList('Jane Smith');

    // Verify address was imported via API
    const people = await listOrEmpty<PersonRow>(userToken, 'people');
    const john = people.find((p) => p.name === 'John Smith');
    expect(john).toBeDefined();

    const sharedData = await getPersonSharedData(userToken, john!.id);
    expect(sharedData).toBeDefined();
    expect(sharedData?.address_id).toBeDefined();

    if (sharedData?.address_id) {
      const address = await e2eClient(userToken).collection<AddressRow>('addresses').get(sharedData.address_id);
      expect(address.line1).toContain('123 Main St');
      expect(address.wifi_network).toBe('HomeNetwork');
    }
  });

  test('should import people with partner relationships', async () => {
    await peoplePage.gotoBulkImport();

    // Upload CSV with partner data
    await peoplePage.uploadCSVContent(testBulkImportCSV.partnerImport);

    // Wait for stats to appear
    await h.driver.expect(h.driver.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

    // Items are auto-selected on upload, import directly
    await h.driver.expect(h.driver.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
    await h.driver.getByTestId('import-button').click();

    // Wait for redirect
    await h.driver.waitForURL(/\/people$/);

    // Verify people are in list
    await peoplePage.expectPersonInList('Mike Brown');
    await peoplePage.expectPersonInList('Sarah Brown');

    // Verify partner relationship via API
    const people = await listOrEmpty<PersonRow>(userToken, 'people');
    const mike = people.find((p) => p.name === 'Mike Brown');
    const sarah = people.find((p) => p.name === 'Sarah Brown');

    expect(mike).toBeDefined();
    expect(sarah).toBeDefined();

    // Check that they share the same shared_data record
    const mikeSharedData = await getPersonSharedData(userToken, mike!.id);
    const sarahSharedData = await getPersonSharedData(userToken, sarah!.id);

    expect(mikeSharedData).toBeDefined();
    expect(sarahSharedData).toBeDefined();
    expect(mikeSharedData?.id).toBe(sarahSharedData?.id);

    // And the pairing is recorded as one partner relationship
    const partnerRows = (await listRelationships(userToken)).filter((r) => r.kind === 'partner');
    expect(partnerRows).toHaveLength(1);
    expect([partnerRows[0].person_a, partnerRows[0].person_b].sort()).toEqual([mike!.id, sarah!.id].sort());
  });

  test('should import people with WiFi information', async () => {
    await peoplePage.gotoBulkImport();

    // Upload CSV with WiFi data
    await peoplePage.uploadCSVContent(testBulkImportCSV.wifiInfoImport);

    // Wait for stats to appear
    await h.driver.expect(h.driver.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

    // Items are auto-selected on upload, import directly
    await h.driver.expect(h.driver.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
    await h.driver.getByTestId('import-button').click();

    // Wait for redirect
    await h.driver.waitForURL(/\/people$/);

    // Verify WiFi data via API
    const people = await listOrEmpty<PersonRow>(userToken, 'people');
    const david = people.find((p) => p.name === 'David Lee');

    const sharedData = await getPersonSharedData(userToken, david!.id);
    expect(sharedData?.address_id).toBeDefined();

    if (sharedData?.address_id) {
      const address = await e2eClient(userToken).collection<AddressRow>('addresses').get(sharedData.address_id);
      expect(address.wifi_network).toBe('OfficeWiFi');
      expect(address.wifi_password).toBe('secure123');
    }
  });

  test('should handle mixed valid and invalid rows', async () => {
    await peoplePage.gotoBulkImport();

    // Upload CSV with mixed data
    await peoplePage.uploadCSVContent(testBulkImportCSV.mixedValidInvalid);

    // Wait for stats to appear and verify counts
    await h.driver.expect(h.driver.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });
    await h.driver.expect(h.driver.getByText('Invalid People', { exact: true })).toBeVisible();

    // Items are auto-selected on upload (only valid will be selected)
    await h.driver.expect(h.driver.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
    await h.driver.getByTestId('import-button').click();

    // Wait for redirect
    await h.driver.waitForURL(/\/people$/);

    // Verify only valid people are in list
    await peoplePage.expectPersonInList('Valid Person');
    await peoplePage.expectPersonInList('Another Valid');
  });

  test('should show validation errors for invalid data', async () => {
    await peoplePage.gotoBulkImport();

    // Upload CSV with validation errors
    await peoplePage.uploadCSVContent(testBulkImportCSV.validationErrors);

    // Wait for stats to appear
    await h.driver.expect(h.driver.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });
    await h.driver.expect(h.driver.getByText('Invalid People', { exact: true })).toBeVisible();

    // Verify error messages are shown somewhere on the page
    await h.driver.expect(h.driver.getByText(/name.*required/i)).toBeVisible();
  });
});
