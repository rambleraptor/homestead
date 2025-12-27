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

    test('should import people with basic data (name only)', async () => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with basic data
        await peoplePage.uploadCSVContent(testBulkImportCSV.basicImport);

        // Verify parsed count
        await peoplePage.expectParsedPeopleCount(3, 0);

        // Import all
        await peoplePage.selectAllValidPeople();
        await peoplePage.clickImport();

        // Verify people are in list
        await peoplePage.expectPersonInList('Alice Johnson');
        await peoplePage.expectPersonInList('Bob Williams');
        await peoplePage.expectPersonInList('Carol Davis');
    });

    test('should import people with full data including structured address', async ({ userPocketbase }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with full data
        await peoplePage.uploadCSVContent(testBulkImportCSV.fullDataImport);

        // Verify parsed count
        await peoplePage.expectParsedPeopleCount(2, 0);

        // Verify preview shows partner
        await peoplePage.expectPreviewShowsPartner('John Smith', 'Jane Smith');
        await peoplePage.expectPreviewShowsWifi('John Smith', 'HomeNetwork');

        // Import all
        await peoplePage.selectAllValidPeople();
        await peoplePage.clickImport();

        // Verify people are in list
        await peoplePage.expectPersonInList('John Smith');
        await peoplePage.expectPersonInList('Jane Smith');

        // Verify John has Jane as partner
        await peoplePage.expectPersonHasPartner('John Smith', 'Jane Smith');

        // Verify address was imported via API
        const people = await userPocketbase.collection('people').getFullList();
        const john = people.find(p => p.name === 'John Smith');
        expect(john).toBeDefined();

        const sharedData = await getPersonSharedData(userPocketbase, john!.id);
        expect(sharedData).toBeDefined();
        expect(sharedData?.address_id).toBeDefined();

        if (sharedData?.address_id) {
            const address = await userPocketbase.collection('addresses').getOne(sharedData.address_id);
            expect(address.line1).toBe('123 Main St');
            expect(address.line2).toBe('Apt 4B');
            expect(address.city).toBe('Springfield');
            expect(address.state).toBe('IL');
            expect(address.postal_code).toBe('62701');
            expect(address.wifi_network).toBe('HomeNetwork');
        }
    });

    test('should import people with partner relationships', async ({ userPocketbase }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with partner data
        await peoplePage.uploadCSVContent(testBulkImportCSV.partnerImport);

        // Verify parsed count
        await peoplePage.expectParsedPeopleCount(2, 0);

        // Import all
        await peoplePage.selectAllValidPeople();
        await peoplePage.clickImport();

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

        // Check that person_a and person_b are set correctly
        const sharedPersonIds = [mikeSharedData?.person_a, mikeSharedData?.person_b].filter(Boolean);
        expect(sharedPersonIds).toContain(mike!.id);
        expect(sharedPersonIds).toContain(sarah!.id);
    });

    test('should import people with WiFi information', async ({ userPocketbase }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with WiFi data
        await peoplePage.uploadCSVContent(testBulkImportCSV.wifiInfoImport);

        // Verify parsed count
        await peoplePage.expectParsedPeopleCount(2, 0);

        // Verify preview shows WiFi
        await peoplePage.expectPreviewShowsWifi('David Lee', 'OfficeWiFi');
        await peoplePage.expectPreviewShowsWifi('Lisa Chen', 'HomeNet');

        // Import all
        await peoplePage.selectAllValidPeople();
        await peoplePage.clickImport();

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

    test('should handle mixed valid and invalid rows', async () => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with mixed data
        await peoplePage.uploadCSVContent(testBulkImportCSV.mixedValidInvalid);

        // Verify parsed count - should have some valid and some invalid
        await peoplePage.expectParsedPeopleCount(2, 2);

        // Import only valid people
        await peoplePage.selectAllValidPeople();
        await peoplePage.clickImport();

        // Verify only valid people are in list
        await peoplePage.expectPersonInList('Valid Person');
        await peoplePage.expectPersonInList('Another Valid');
    });

    test('should show validation errors for invalid data', async ({ authenticatedPage }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with validation errors
        await peoplePage.uploadCSVContent(testBulkImportCSV.validationErrors);

        // Verify some rows are invalid
        await peoplePage.expectParsedPeopleCount(1, 2);

        // Verify error messages are shown (using partial text match)
        await expect(authenticatedPage.getByText(/name.*(is|a).*required/i)).toBeVisible();
        await expect(authenticatedPage.getByText(/birthday.*YYYY-MM-DD.*MM\/DD\/YYYY/i)).toBeVisible();
    });

    test('should import people with structured address only', async ({ userPocketbase }) => {
        await peoplePage.gotoBulkImport();

        // Upload CSV with structured address
        await peoplePage.uploadCSVContent(testBulkImportCSV.structuredAddressImport);

        // Verify parsed count
        await peoplePage.expectParsedPeopleCount(2, 0);

        // Import all
        await peoplePage.selectAllValidPeople();
        await peoplePage.clickImport();

        // Verify address data via API
        const people = await userPocketbase.collection('people').getFullList();
        const tom = people.find(p => p.name === 'Tom Wilson');

        const sharedData = await getPersonSharedData(userPocketbase, tom!.id);
        expect(sharedData?.address_id).toBeDefined();

        if (sharedData?.address_id) {
            const address = await userPocketbase.collection('addresses').getOne(sharedData.address_id);
            expect(address.line1).toBe('789 Pine Ln');
            expect(address.line2).toBe('Suite 100');
            expect(address.city).toBe('Chicago');
            expect(address.state).toBe('IL');
            expect(address.country).toBe('USA');
        }
    });
});
