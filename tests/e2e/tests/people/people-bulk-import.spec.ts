/**
 * People Bulk Import E2E Tests
 *
 * Tests for the bulk CSV import functionality for people
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import { testBulkImportCSV } from '../../fixtures/test-data';
import { deleteAllPeople, getPersonSharedData } from '../../utils/pocketbase-helpers';

test.describe('People Bulk Import', () => {
    let peoplePage: PeoplePage;

    test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
        peoplePage = new PeoplePage(authenticatedPage);

        // Clean up any existing people
        await deleteAllPeople(userPocketbase);
    });

    test('should import people with basic data (name only)', async ({ authenticatedPage }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with basic data
        await peoplePage.uploadCSVContent(testBulkImportCSV.basicImport);

        // Wait for stats to appear and verify count (UI shows "Valid People" from moduleName)
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });
        await expect(authenticatedPage.getByText('3', { exact: true }).first()).toBeVisible();

        // Click Select All button
        await authenticatedPage.getByRole('button', { name: 'Select All' }).click();

        // Click the import button (which shows selected count)
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect to people page
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify people are in list
        await peoplePage.expectPersonInList('Alice Johnson');
        await peoplePage.expectPersonInList('Bob Williams');
        await peoplePage.expectPersonInList('Carol Davis');
    });

    test('should import people with full data', async ({ authenticatedPage, userPocketbase }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with full data
        await peoplePage.uploadCSVContent(testBulkImportCSV.fullDataImport);

        // Wait for stats to appear
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

        // Click Select All and Import
        await authenticatedPage.getByRole('button', { name: 'Select All' }).click();
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify people are in list
        await peoplePage.expectPersonInList('John Smith');
        await peoplePage.expectPersonInList('Jane Smith');

        // Verify address was imported via API
        const people = await userPocketbase.collection('people').getFullList();
        const john = people.find(p => p.name === 'John Smith');
        expect(john).toBeDefined();

        const sharedData = await getPersonSharedData(userPocketbase, john!.id);
        expect(sharedData).toBeDefined();
        expect(sharedData?.address_id).toBeDefined();

        if (sharedData?.address_id) {
            const address = await userPocketbase.collection('addresses').getOne(sharedData.address_id);
            expect(address.line1).toContain('123 Main St');
            expect(address.wifi_network).toBe('HomeNetwork');
        }
    });

    test('should import people with partner relationships', async ({ authenticatedPage, userPocketbase }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with partner data
        await peoplePage.uploadCSVContent(testBulkImportCSV.partnerImport);

        // Wait for stats to appear
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

        // Click Select All and Import
        await authenticatedPage.getByRole('button', { name: 'Select All' }).click();
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify people are in list
        await peoplePage.expectPersonInList('Mike Brown');
        await peoplePage.expectPersonInList('Sarah Brown');

        // Verify partner relationship via API
        const people = await userPocketbase.collection('people').getFullList();
        const mike = people.find(p => p.name === 'Mike Brown');
        const sarah = people.find(p => p.name === 'Sarah Brown');

        expect(mike).toBeDefined();
        expect(sarah).toBeDefined();

        // Check that they share the same shared_data record
        const mikeSharedData = await getPersonSharedData(userPocketbase, mike!.id);
        const sarahSharedData = await getPersonSharedData(userPocketbase, sarah!.id);

        expect(mikeSharedData).toBeDefined();
        expect(sarahSharedData).toBeDefined();
        expect(mikeSharedData?.id).toBe(sarahSharedData?.id);
    });

    test('should import people with WiFi information', async ({ authenticatedPage, userPocketbase }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with WiFi data
        await peoplePage.uploadCSVContent(testBulkImportCSV.wifiInfoImport);

        // Wait for stats to appear
        await expect(authenticatedPage.getByText('Valid People', { exact: true })).toBeVisible({ timeout: 10000 });

        // Click Select All and Import
        await authenticatedPage.getByRole('button', { name: 'Select All' }).click();
        await authenticatedPage.getByTestId('import-button').click();

        // Wait for redirect
        await authenticatedPage.waitForURL(/\/people$/);

        // Verify WiFi data via API
        const people = await userPocketbase.collection('people').getFullList();
        const david = people.find(p => p.name === 'David Lee');

        const sharedData = await getPersonSharedData(userPocketbase, david!.id);
        expect(sharedData?.address_id).toBeDefined();

        if (sharedData?.address_id) {
            const address = await userPocketbase.collection('addresses').getOne(sharedData.address_id);
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

        // Click Select All and Import (only valid will be selected)
        await authenticatedPage.getByRole('button', { name: 'Select All' }).click();
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
