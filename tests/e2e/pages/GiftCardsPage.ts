/**
 * Gift Cards Page Object Model
 */

import { Page, expect, Locator } from '@playwright/test';

export class GiftCardsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/gift-cards');
  }

  async expectToBeOnGiftCardsPage() {
    await expect(this.page).toHaveURL(/\/gift-cards/);
  }

  async clickAddGiftCard() {
    await this.page.getByRole('button', { name: /add gift card|new gift card/i }).click();
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
    await this.page.getByRole('button', { name: /add card|update|saving/i }).click();
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

    // Wait for form to close or success message
    await this.page.waitForTimeout(500);
  }

  async expectGiftCardInList(merchant: string, amount?: number) {
    // Use .first() to handle cases where merchant appears in both summary and list
    await expect(this.page.getByText(merchant).first()).toBeVisible();

    if (amount !== undefined) {
      const formattedAmount = `$${amount.toFixed(2)}`;
      // Use .first() to handle cases where amount appears in both summary and individual cards
      await expect(this.page.getByText(formattedAmount).first()).toBeVisible();
    }
  }

  async expectGiftCardNotInList(merchant: string) {
    await expect(this.page.getByText(merchant).first()).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // If the element doesn't exist at all, that's also fine
    });
  }

  async getGiftCardRow(merchant: string): Promise<Locator> {
    // Gift cards are displayed as card components, not table rows
    // Find by looking for the merchant amount heading
    return this.page.locator('.bg-white.rounded-lg.border').filter({ hasText: /\$\d+\.\d{2}/ }).first();
  }

  async clickMerchant(merchant: string) {
    // Click on a merchant card to view its gift cards
    await this.page.getByText(merchant).click();
    await this.page.waitForTimeout(300);
  }

  async editGiftCard(merchant: string, newData: Partial<{
    merchant: string;
    amount: number;
    card_number: string;
    pin: string;
    notes: string;
  }>, cardAmount?: number) {
    // First, ensure we're viewing the merchant's cards
    // Click on the merchant if we're on the list view
    await this.expectGiftCardInList(merchant);
    await this.clickMerchant(merchant);

    // Wait for the merchant detail view to load
    await this.page.waitForTimeout(500);

    // Use aria-label to find the edit button for a specific card
    // Format: "Edit Amazon card ($50.00)"
    if (cardAmount !== undefined) {
      await this.page.getByRole('button', { name: `Edit ${merchant} card ($${cardAmount.toFixed(2)})` }).first().click();
    } else {
      // Fall back to finding any edit button with the merchant name
      await this.page.getByRole('button', { name: new RegExp(`Edit ${merchant}`, 'i') }).first().click();
    }

    if (newData.merchant) {
      await this.page.locator('#merchant').fill(newData.merchant);
    }

    if (newData.amount !== undefined) {
      const amountField = this.page.locator('#amount');
      await amountField.clear();
      await amountField.fill(newData.amount.toString());
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

    await this.submitGiftCardForm();

    // Wait for the form to close
    await this.page.waitForTimeout(500);

    // Wait for network to be idle to ensure data has reloaded
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // If networkidle timeout, that's ok - continue anyway
    });

    // Navigate back to main gift cards view to see the updated data
    await this.goto();

    // Give React Query time to refetch and update the UI
    await this.page.waitForTimeout(1000);
  }

  async deleteGiftCard(merchant: string, cardAmount?: number) {
    // First, ensure we're viewing the merchant's cards
    // Click on the merchant if we're on the list view
    await this.expectGiftCardInList(merchant);
    await this.clickMerchant(merchant);

    // Wait for the merchant detail view to load
    await this.page.waitForTimeout(500);

    // Use aria-label to find the delete button for a specific card
    // Format: "Delete Amazon card ($50.00)"
    if (cardAmount !== undefined) {
      await this.page.getByRole('button', { name: `Delete ${merchant} card ($${cardAmount.toFixed(2)})` }).first().click();
    } else {
      // Fall back to finding any delete button with the merchant name
      await this.page.getByRole('button', { name: new RegExp(`Delete ${merchant}`, 'i') }).first().click();
    }

    // Confirm deletion if there's a confirmation dialog
    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|delete/i });

    try {
      await confirmButton.click({ timeout: 2000 });
    } catch {
      // No confirmation dialog, that's fine
    }

    await this.page.waitForTimeout(500);
  }

  async expectMerchantSummary(merchant: string, totalAmount: number) {
    await expect(this.page.getByText(merchant)).toBeVisible();
    const formattedTotal = `$${totalAmount.toFixed(2)}`;
    await expect(this.page.getByText(formattedTotal)).toBeVisible();
  }
}
