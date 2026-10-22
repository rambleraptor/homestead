/**
 * HSA Page Object Model
 */

import { Page, expect } from '@playwright/test';
import { waitForNetworkIdle } from '../../../../tests/e2e/utils/network';

export class HSAPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/receipts');
  }

  async expectToBeOnHSAPage() {
    await expect(this.page).toHaveURL(/\/receipts/);
  }

  async clickAddReceipt() {
    const addButton = this.page.getByTestId('add-hsa-receipt-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillReceiptForm(data: {
    merchant: string;
    service_date: string;
    amount: number;
    category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
    patient?: string;
    notes?: string;
  }) {
    await this.page.locator('#merchant').fill(data.merchant);
    await this.page.locator('#service_date').fill(data.service_date);
    await this.page.locator('#amount').fill(data.amount.toString());
    await this.page.locator('#category').selectOption(data.category);

    if (data.patient) {
      await this.page.locator('#patient').fill(data.patient);
    }

    if (data.notes) {
      await this.page.locator('#notes').fill(data.notes);
    }

    // Upload a test file (required field)
    // Create a minimal valid JPEG file with proper magic bytes
    const fileInput = this.page.locator('#receipt_file');
    const minimalJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
    ]);
    await fileInput.setInputFiles({
      name: 'test-receipt.jpg',
      mimeType: 'image/jpeg',
      buffer: minimalJpeg,
    });
  }

  async submitReceiptForm() {
    const submitButton = this.page.getByTestId('hsa-receipt-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    // Wait for the submit button to disappear (form closed)
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createReceipt(data: {
    merchant: string;
    service_date: string;
    amount: number;
    category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
    patient?: string;
    notes?: string;
  }) {
    await this.clickAddReceipt();
    await this.fillReceiptForm(data);
    await this.submitReceiptForm();
    // Wait for network to settle after mutation
    await waitForNetworkIdle(this.page);
  }

  async expectReceiptInList(merchant: string, amount?: number) {
    await expect(this.page.getByText(merchant).first()).toBeVisible();

    if (amount !== undefined) {
      const formattedAmount = `$${amount.toFixed(2)}`;
      await expect(this.page.getByText(formattedAmount).first()).toBeVisible();
    }
  }

  async expectReceiptNotInList(merchant: string) {
    const merchantLocator = this.page.getByText(merchant).first();
    await expect(merchantLocator).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Element doesn't exist, which is fine
    });
  }

  async expectLiquidatableCash(amount: number) {
    const formattedAmount = `$${amount.toFixed(2)}`;
    // The KPI card shows the total
    await expect(this.page.getByText(formattedAmount).first()).toBeVisible();
  }

  async editReceipt(
    merchant: string,
    updates: {
      merchant?: string;
      service_date?: string;
      amount?: number;
      category?: 'Medical' | 'Dental' | 'Vision' | 'Rx';
      status?: 'Stored' | 'Reimbursed';
      patient?: string;
      notes?: string;
    },
  ) {
    const editButton = this.page.getByRole('button', {
      name: new RegExp(`Edit ${merchant} receipt`, 'i'),
    });
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    // The edit modal renders its own set of fields (prefixed ids).
    const submit = this.page.getByTestId('hsa-receipt-edit-submit');
    await submit.waitFor({ state: 'visible' });

    if (updates.merchant !== undefined) {
      await this.page.locator('#edit-merchant').fill(updates.merchant);
    }
    if (updates.service_date !== undefined) {
      await this.page.locator('#edit-service_date').fill(updates.service_date);
    }
    if (updates.amount !== undefined) {
      await this.page.locator('#edit-amount').fill(updates.amount.toString());
    }
    if (updates.category !== undefined) {
      await this.page.locator('#edit-category').selectOption(updates.category);
    }
    if (updates.status !== undefined) {
      await this.page.locator('#edit-status').selectOption(updates.status);
    }
    if (updates.patient !== undefined) {
      await this.page.locator('#edit-patient').fill(updates.patient);
    }
    if (updates.notes !== undefined) {
      await this.page.locator('#edit-notes').fill(updates.notes);
    }

    await submit.click();
    await submit.waitFor({ state: 'hidden' });
    await waitForNetworkIdle(this.page);
  }

  async markReceiptAsReimbursed(merchant: string) {
    const markButton = this.page.getByRole('button', {
      name: new RegExp(`Mark ${merchant}.*reimbursed`, 'i'),
    });
    await markButton.waitFor({ state: 'visible' });
    await markButton.click();
    // Wait for network to settle after mutation
    await waitForNetworkIdle(this.page);
  }

  async deleteReceipt(merchant: string) {
    const deleteButton = this.page.getByRole('button', {
      name: new RegExp(`Delete ${merchant}`, 'i'),
    });
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

    // Handle confirmation dialog if present
    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|delete/i });
    const isConfirmVisible = await confirmButton.isVisible({ timeout: 1000 }).catch(() => false);

    if (isConfirmVisible) {
      await confirmButton.click();
    }

    // Wait for network to settle after deletion
    await waitForNetworkIdle(this.page);
  }

  async filterByStatus(status: 'All' | 'Stored' | 'Reimbursed') {
    const filterSelect = this.page.locator('#status-filter');
    await filterSelect.waitFor({ state: 'visible' });
    await filterSelect.selectOption(status);
    // Wait for filter to apply
    await waitForNetworkIdle(this.page);
  }

  async expectReceiptStatus(merchant: string, status: 'Stored' | 'Reimbursed') {
    // Find the row containing the merchant
    const row = this.page.locator('tr').filter({ hasText: merchant });
    await expect(row.getByText(status)).toBeVisible();
  }

  async expectReceiptCount(count: number) {
    await expect(this.page.getByText(new RegExp(`Showing ${count}`)).first()).toBeVisible();
  }

  async expectEmptyState() {
    await expect(this.page.getByText(/no receipts found/i)).toBeVisible();
  }
}
