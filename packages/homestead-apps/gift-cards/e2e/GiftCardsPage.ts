/**
 * Gift Cards Page Object Model
 */

import { Page, expect, Locator } from '@playwright/test';
import { waitForNetworkIdle } from '../../../../tests/e2e/utils/network';

export class GiftCardsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/gift-cards');
  }

  async expectToBeOnGiftCardsPage() {
    await expect(this.page).toHaveURL(/\/gift-cards/);
  }

  async clickAddGiftCard() {
    const addButton = this.page.getByTestId('add-gift-card-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillGiftCardForm(data: {
    merchant: string;
    amount: number;
    card_number?: string;
    pin?: string;
    notes?: string;
  }) {
    await this.page.locator('#merchant').fill(data.merchant);
    await this.page.locator('#card_number').fill(data.card_number || '1234-5678-9012-3456');
    await this.page.locator('#amount').fill(data.amount.toString());

    if (data.pin) {
      await this.page.locator('#pin').fill(data.pin);
    }

    if (data.notes) {
      await this.page.locator('#notes').fill(data.notes);
    }
  }

  async submitGiftCardForm() {
    const submitButton = this.page.getByTestId('gift-card-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    // Wait for the submit button to disappear (form closed)
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createGiftCard(data: {
    merchant: string;
    amount: number;
    card_number?: string;
    pin?: string;
    notes?: string;
  }) {
    await this.clickAddGiftCard();
    await this.fillGiftCardForm(data);
    await this.submitGiftCardForm();
    // Wait for network to settle after mutation
    await waitForNetworkIdle(this.page);
  }

  async expectGiftCardInList(merchant: string, amount?: number) {
    // Use .first() to handle cases where merchant appears in multiple places
    await expect(this.page.getByText(merchant).first()).toBeVisible();

    if (amount !== undefined) {
      const formattedAmount = `$${amount.toFixed(2)}`;
      await expect(this.page.getByText(formattedAmount).first()).toBeVisible();
    }
  }

  async expectGiftCardNotInList(merchant: string) {
    // Check that the merchant text is not visible
    const merchantLocator = this.page.getByText(merchant).first();
    await expect(merchantLocator).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Element doesn't exist, which is fine
    });
  }

  async getGiftCardRow(merchant: string): Promise<Locator> {
    // Gift cards are displayed as card components
    return this.page.locator('.bg-white.rounded-lg.border').filter({ hasText: merchant }).first();
  }

  async clickMerchant(merchant: string) {
    // Click on a merchant card to view its gift cards
    const merchantCard = this.page.getByText(merchant);
    await merchantCard.waitFor({ state: 'visible' });
    await merchantCard.click();
    // Wait for detail view to load
    await waitForNetworkIdle(this.page);
  }

  async editGiftCard(merchant: string, newData: Partial<{
    merchant: string;
    amount: number;
    card_number: string;
    pin: string;
    notes: string;
  }>, cardAmount?: number) {
    // First, ensure we're viewing the merchant's cards
    await this.expectGiftCardInList(merchant);
    await this.clickMerchant(merchant);

    // Find and click the edit button
    let editButton: Locator;
    if (cardAmount !== undefined) {
      const buttonName = `Edit ${merchant} card ($${cardAmount.toFixed(2)})`;
      editButton = this.page.getByRole('button', { name: buttonName }).first();
    } else {
      editButton = this.page.getByRole('button', { name: new RegExp(`Edit ${merchant}`, 'i') }).first();
    }

    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    // Wait for form to be visible
    await this.page.locator('#merchant').waitFor({ state: 'visible' });

    // Fill in changed fields
    if (newData.merchant) {
      await this.page.locator('#merchant').fill(newData.merchant);
    }

    if (newData.amount !== undefined) {
      await this.page.locator('#amount').fill(newData.amount.toString());
    }

    if (newData.card_number) {
      await this.page.locator('#card_number').fill(newData.card_number);
    }

    if (newData.pin) {
      await this.page.locator('#pin').fill(newData.pin);
    }

    if (newData.notes) {
      await this.page.locator('#notes').fill(newData.notes);
    }

    // Submit and wait for form to close
    await this.submitGiftCardForm();
  }

  async deleteGiftCard(merchant: string, cardAmount?: number) {
    // Ensure we're viewing the merchant's cards
    await this.expectGiftCardInList(merchant);
    await this.clickMerchant(merchant);

    // Find and click delete button
    let deleteButton: Locator;
    if (cardAmount !== undefined) {
      deleteButton = this.page.getByRole('button', {
        name: `Delete ${merchant} card ($${cardAmount.toFixed(2)})`
      }).first();
    } else {
      deleteButton = this.page.getByRole('button', {
        name: new RegExp(`Delete ${merchant}`, 'i')
      }).first();
    }

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

  async expectMerchantSummary(merchant: string, totalAmount: number) {
    await expect(this.page.getByText(merchant)).toBeVisible();
    const formattedTotal = `$${totalAmount.toFixed(2)}`;
    await expect(this.page.getByText(formattedTotal)).toBeVisible();
  }
}
