/**
 * HSA E2E Tests - CRUD Operations
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { HSAPage } from '../../pages/HSAPage';
import { testHSAReceipts } from '../../fixtures/test-data';
import {
  aepGet,
  createHSAReceipt,
  deleteAllHSAReceipts,
} from '../../utils/aepbase-helpers';

test.describe('HSA CRUD', () => {
  let hsaPage: HSAPage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    hsaPage = new HSAPage(authenticatedPage);

    // Clean up any existing HSA receipts for this test user
    await deleteAllHSAReceipts(userToken);

    await hsaPage.goto();
  });

  test('should create a new HSA receipt', async () => {
    const receiptData = testHSAReceipts[0];

    await hsaPage.createReceipt(receiptData);

    // Verify it appears in the list
    await hsaPage.expectReceiptInList(receiptData.merchant, receiptData.amount);
  });

  test('should create multiple receipts', async () => {
    for (const receiptData of testHSAReceipts.slice(0, 3)) {
      await hsaPage.createReceipt(receiptData);
    }

    // Verify all appear in the list
    for (const receiptData of testHSAReceipts.slice(0, 3)) {
      await hsaPage.expectReceiptInList(receiptData.merchant);
    }
  });

  test('should calculate liquidatable cash correctly', async ({ userToken }) => {
    // Create receipts via API for faster setup
    const storedReceipts = testHSAReceipts.filter(r => r.status === 'Stored').slice(0, 2);
    for (const receipt of storedReceipts) {
      await createHSAReceipt(userToken, receipt);
    }

    await hsaPage.goto();

    // Calculate expected total
    const expectedTotal = storedReceipts.reduce((sum, r) => sum + r.amount, 0);
    await hsaPage.expectLiquidatableCash(expectedTotal);
  });

  test('should mark receipt as reimbursed', async ({ userToken }) => {
    // Create a stored receipt via API
    const receiptData = testHSAReceipts[0];
    const createdReceipt = await createHSAReceipt(userToken, receiptData);

    await hsaPage.goto();

    // Verify receipt is in list with Stored status
    await hsaPage.expectReceiptStatus(receiptData.merchant, 'Stored');

    // Mark as reimbursed
    await hsaPage.markReceiptAsReimbursed(receiptData.merchant);

    // Verify status changed in database
    const updatedReceipt = await aepGet<{ status: string }>(
      userToken,
      'hsa-receipts',
      createdReceipt.id,
    );
    expect(updatedReceipt.status).toBe('Reimbursed');

    // Verify status changed in UI
    await hsaPage.expectReceiptStatus(receiptData.merchant, 'Reimbursed');
  });

  test('should filter receipts by status', async ({ userToken }) => {
    // Create mix of stored and reimbursed receipts
    const storedReceipt = testHSAReceipts[0];
    const reimbursedReceipt = testHSAReceipts[3];

    await createHSAReceipt(userToken, storedReceipt);
    await createHSAReceipt(userToken, reimbursedReceipt);

    await hsaPage.goto();

    // Filter to show only Stored
    await hsaPage.filterByStatus('Stored');
    await hsaPage.expectReceiptInList(storedReceipt.merchant);
    await hsaPage.expectReceiptNotInList(reimbursedReceipt.merchant);

    // Filter to show only Reimbursed
    await hsaPage.filterByStatus('Reimbursed');
    await hsaPage.expectReceiptNotInList(storedReceipt.merchant);
    await hsaPage.expectReceiptInList(reimbursedReceipt.merchant);

    // Filter to show All
    await hsaPage.filterByStatus('All');
    await hsaPage.expectReceiptInList(storedReceipt.merchant);
    await hsaPage.expectReceiptInList(reimbursedReceipt.merchant);
  });

  test('should delete a receipt', async ({ userToken }) => {
    // Create a receipt via API
    const receiptData = testHSAReceipts[0];
    await createHSAReceipt(userToken, receiptData);

    await hsaPage.goto();

    // Verify receipt exists
    await hsaPage.expectReceiptInList(receiptData.merchant, receiptData.amount);

    // Delete it
    await hsaPage.deleteReceipt(receiptData.merchant);

    // Verify it's removed from UI
    await hsaPage.expectReceiptNotInList(receiptData.merchant);
  });

  test('should update liquidatable cash when marking as reimbursed', async ({ userToken }) => {
    // Create two stored receipts
    const receipt1 = testHSAReceipts[0];
    const receipt2 = testHSAReceipts[1];

    await createHSAReceipt(userToken, receipt1);
    await createHSAReceipt(userToken, receipt2);

    await hsaPage.goto();

    // Initial total should be sum of both
    const initialTotal = receipt1.amount + receipt2.amount;
    await hsaPage.expectLiquidatableCash(initialTotal);

    // Mark one as reimbursed
    await hsaPage.markReceiptAsReimbursed(receipt1.merchant);

    // Total should now be just receipt2
    await hsaPage.expectLiquidatableCash(receipt2.amount);
  });

  test('should display all receipt categories correctly', async ({ userToken }) => {
    // Create one receipt for each category
    const receipts = [
      testHSAReceipts[0], // Rx
      testHSAReceipts[1], // Dental
      testHSAReceipts[2], // Vision
      { ...testHSAReceipts[0], merchant: 'Medical Clinic', category: 'Medical' as const }, // Medical
    ];

    for (const receipt of receipts) {
      await createHSAReceipt(userToken, receipt);
    }

    await hsaPage.goto();

    // Verify all merchants appear
    for (const receipt of receipts) {
      await hsaPage.expectReceiptInList(receipt.merchant);
    }
  });

  test('should handle empty state', async () => {
    // No receipts created
    await hsaPage.goto();

    // Should show 0 liquidatable cash
    await hsaPage.expectLiquidatableCash(0);

    // Should show message about no receipts
    await hsaPage.expectEmptyState();
  });
});
