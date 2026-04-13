/**
 * People Bulk Import E2E Tests
 *
 * Tests for the bulk CSV import functionality for people
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import { testBulkImportCSV } from '../../fixtures/test-data';
import {
  aepGet,
  aepList,
  deleteAllPeople,
  getPersonSharedData,
} from '../../utils/aepbase-helpers';

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

test.describe('People Bulk Import', () => {
    let peoplePage: PeoplePage;

    test.beforeEach(async ({ authenticatedPage, userToken }) => {
        peoplePage = new PeoplePage(authenticatedPage);

        // Clean up any existing people
        await deleteAllPeople(userToken);
    });

    test('should import people with basic data (name only)', async ({ authenticatedPage }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with basic data
        await peoplePage.uploadCSVContent(testBulkImportCSV.basicImport);

        // Wait for stats to appear and verify count (UI shows "Valid People" from moduleName)
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });
        await expect(authenticatedPage.getByText('3', { exact: true }).first()).toBeVisible();

        // Items are auto-selected on upload, so we can import directly
        // Wait for the import button to be enabled with the correct count
        await expect(authenticatedPage.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
        await expect(authenticatedPage.getByTestId('import-button')).toContainText('Import 3 People(s)');

        // Click the import button (which shows selected count)
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect to people page
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify people are in list
        await peoplePage.expectPersonInList('Alice Johnson');
        await peoplePage.expectPersonInList('Bob Williams');
        await peoplePage.expectPersonInList('Carol Davis');
    });

    test('should import people with full data', async ({ authenticatedPage, userToken }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with full data
        await peoplePage.uploadCSVContent(testBulkImportCSV.fullDataImport);

        // Wait for stats to appear
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

        // Items are auto-selected on upload, import directly
        await expect(authenticatedPage.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify people are in list
        await peoplePage.expectPersonInList('John Smith');
        await peoplePage.expectPersonInList('Jane Smith');

        // Verify address was imported via API
        const people = await aepList<PersonRow>(userToken, 'people');
        const john = people.find((p) => p.name === 'John Smith');
        expect(john).toBeDefined();

        const sharedData = await getPersonSharedData(userToken, john!.id);
        expect(sharedData).toBeDefined();
        expect(sharedData?.address_id).toBeDefined();

        if (sharedData?.address_id) {
            const address = await aepGet<AddressRow>(userToken, 'addresses', sharedData.address_id);
            expect(address.line1).toContain('123 Main St');
            expect(address.wifi_network).toBe('HomeNetwork');
        }
    });

    test('should import people with partner relationships', async ({ authenticatedPage, userToken }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with partner data
        await peoplePage.uploadCSVContent(testBulkImportCSV.partnerImport);

        // Wait for stats to appear
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

        // Items are auto-selected on upload, import directly
        await expect(authenticatedPage.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify people are in list
        await peoplePage.expectPersonInList('Mike Brown');
        await peoplePage.expectPersonInList('Sarah Brown');

        // Verify partner relationship via API
        const people = await aepList<PersonRow>(userToken, 'people');
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
    });

    test('should import people with WiFi information', async ({ authenticatedPage, userToken }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with WiFi data
        await peoplePage.uploadCSVContent(testBulkImportCSV.wifiInfoImport);

        // Wait for stats to appear
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

        // Items are auto-selected on upload, import directly
        await expect(authenticatedPage.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify WiFi data via API
        const people = await aepList<PersonRow>(userToken, 'people');
        const david = people.find((p) => p.name === 'David Lee');

        const sharedData = await getPersonSharedData(userToken, david!.id);
        expect(sharedData?.address_id).toBeDefined();

        if (sharedData?.address_id) {
            const address = await aepGet<AddressRow>(userToken, 'addresses', sharedData.address_id);
            expect(address.wifi_network).toBe('OfficeWiFi');
            expect(address.wifi_password).toBe('secure123');
        }
    });

    test('should handle mixed valid and invalid rows', async ({ authenticatedPage }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with mixed data
        await peoplePage.uploadCSVContent(testBulkImportCSV.mixedValidInvalid);

        // Wait for stats to appear and verify counts
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });
        await expect(authenticatedPage.getByText('Invalid People', { exact: true })).toBeVisible();

        // Items are auto-selected on upload (only valid will be selected)
        await expect(authenticatedPage.getByTestId('import-button')).toBeEnabled({ timeout: 5000 });
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify only valid people are in list
        await peoplePage.expectPersonInList('Valid Person');
        await peoplePage.expectPersonInList('Another Valid');
    });

    test('should show validation errors for invalid data', async ({ authenticatedPage }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with validation errors
        await peoplePage.uploadCSVContent(testBulkImportCSV.validationErrors);

        // Wait for stats to appear
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });
        await expect(authenticatedPage.getByText('Invalid People', { exact: true })).toBeVisible();

        // Verify error messages are shown somewhere on the page
        await expect(authenticatedPage.getByText(/name.*required/i)).toBeVisible();
        await expect(authenticatedPage.getByText(/birthday.*format/i)).toBeVisible();
    });
});
