/**
 * HSA Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class HSAPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/receipts');
  }

  async expectToBeOnHSAPage() {
    await this.driver.expectURL(/\/receipts/);
  }

  async clickAddReceipt() {
    const addButton = this.driver.getByTestId('add-hsa-receipt-button');
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
    await this.driver.locator('#merchant').fill(data.merchant);
    await this.driver.locator('#service_date').fill(data.service_date);
    await this.driver.locator('#amount').fill(data.amount.toString());
    await this.driver.locator('#category').selectOption(data.category);

    if (data.patient) {
      await this.driver.locator('#patient').fill(data.patient);
    }

    if (data.notes) {
      await this.driver.locator('#notes').fill(data.notes);
    }

    // Upload a test file (required field)
    // Create a minimal valid JPEG file with proper magic bytes
    const fileInput = this.driver.locator('#receipt_file');
    const minimalJpeg = new Uint8Array([
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
    const submitButton = this.driver.getByTestId('hsa-receipt-form-submit');
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
    await this.driver.waitForNetworkIdle();
  }

  async expectReceiptInList(merchant: string, amount?: number) {
    await this.expect(this.driver.getByText(merchant).first()).toBeVisible();

    if (amount !== undefined) {
      const formattedAmount = `$${amount.toFixed(2)}`;
      await this.expect(this.driver.getByText(formattedAmount).first()).toBeVisible();
    }
  }

  async expectReceiptNotInList(merchant: string) {
    await this.expect(this.driver.getByText(merchant).first()).toBeHidden();
  }

  async expectLiquidatableCash(amount: number) {
    const formattedAmount = `$${amount.toFixed(2)}`;
    // The KPI card shows the total
    await this.expect(this.driver.getByText(formattedAmount).first()).toBeVisible();
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
    const editButton = this.driver.getByRole('button', {
      name: new RegExp(`Edit ${merchant} receipt`, 'i'),
    });
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    // The edit modal renders its own set of fields (prefixed ids).
    const submit = this.driver.getByTestId('hsa-receipt-edit-submit');
    await submit.waitFor({ state: 'visible' });

    if (updates.merchant !== undefined) {
      await this.driver.locator('#edit-merchant').fill(updates.merchant);
    }
    if (updates.service_date !== undefined) {
      await this.driver.locator('#edit-service_date').fill(updates.service_date);
    }
    if (updates.amount !== undefined) {
      await this.driver.locator('#edit-amount').fill(updates.amount.toString());
    }
    if (updates.category !== undefined) {
      await this.driver.locator('#edit-category').selectOption(updates.category);
    }
    if (updates.status !== undefined) {
      await this.driver.locator('#edit-status').selectOption(updates.status);
    }
    if (updates.patient !== undefined) {
      await this.driver.locator('#edit-patient').fill(updates.patient);
    }
    if (updates.notes !== undefined) {
      await this.driver.locator('#edit-notes').fill(updates.notes);
    }

    await submit.click();
    await submit.waitFor({ state: 'hidden' });
    await this.driver.waitForNetworkIdle();
  }

  async markReceiptAsReimbursed(merchant: string) {
    const markButton = this.driver.getByRole('button', {
      name: new RegExp(`Mark ${merchant}.*reimbursed`, 'i'),
    });
    await markButton.waitFor({ state: 'visible' });
    await markButton.click();
    // Wait for network to settle after mutation
    await this.driver.waitForNetworkIdle();
  }

  async deleteReceipt(merchant: string) {
    const deleteButton = this.driver.getByRole('button', {
      name: new RegExp(`Delete ${merchant}`, 'i'),
    });
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

    // Deleting always asks for confirmation (ConfirmDialog in MedicalTab).
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();

    // Wait for network to settle after deletion
    await this.driver.waitForNetworkIdle();
  }

  async filterByStatus(status: 'All' | 'Stored' | 'Reimbursed') {
    const filterSelect = this.driver.locator('#status-filter');
    await filterSelect.waitFor({ state: 'visible' });
    await filterSelect.selectOption(status);
    // Wait for filter to apply
    await this.driver.waitForNetworkIdle();
  }

  async expectReceiptStatus(merchant: string, status: 'Stored' | 'Reimbursed') {
    // Find the row containing the merchant
    const row = this.driver.locator('tr').filter({ hasText: merchant });
    await this.expect(row.getByText(status)).toBeVisible();
  }

  async expectReceiptCount(count: number) {
    await this.expect(this.driver.getByText(new RegExp(`Showing ${count}`)).first()).toBeVisible();
  }

  async expectEmptyState() {
    await this.expect(this.driver.getByText(/no receipts found/i)).toBeVisible();
  }
}
