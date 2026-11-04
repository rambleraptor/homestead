/**
 * Gift Cards Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class GiftCardsPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/gift-cards');
  }

  /** Open a merchant's page directly, as a shared link or a reload would. */
  async gotoMerchant(merchant: string) {
    await this.driver.goto(`/gift-cards/merchants/${encodeURIComponent(merchant)}`);
  }

  async expectToBeOnGiftCardsPage() {
    await this.driver.expectURL(/\/gift-cards/);
  }

  /** The merchant's page: its name in the header, with the cards below. */
  async expectMerchantDetail(merchant: string) {
    await this.expect(this.driver.getByTestId('merchant-detail')).toBeVisible();
    await this.expect(this.driver.getByRole('heading', { name: merchant })).toBeVisible();
  }

  /** The merchant page's total balance (the sum, not any one card's amount). */
  async expectMerchantTotal(amount: number) {
    await this.expect(this.driver.getByTestId('merchant-total-balance')).toHaveText(
      `$${amount.toFixed(2)}`,
    );
  }

  /** From a merchant's page, back to the list. */
  async backToMerchants() {
    await this.driver.getByTestId('merchant-detail-back').click();
    await this.driver.expectURL(/\/gift-cards$/);
  }

  /** Spend `amount` from the card on the merchant's page (its Quick Transaction "Use"). */
  async useAmount(cardId: string, amount: number) {
    await this.driver.getByTestId(`quick-transaction-amount-${cardId}`).fill(String(amount));
    await this.driver.getByTestId(`quick-transaction-use-${cardId}`).click();
  }

  /** The "Used up!" celebration, when a transaction spends the last of a card. */
  get celebration(): Locator {
    return this.driver.getByTestId('celebration-toast');
  }

  async clickAddGiftCard() {
    const addButton = this.driver.getByTestId('add-gift-card-button');
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
    await this.driver.locator('#merchant').fill(data.merchant);
    await this.driver.locator('#card_number').fill(data.card_number || '1234-5678-9012-3456');
    await this.driver.locator('#amount').fill(data.amount.toString());

    if (data.pin) {
      await this.driver.locator('#pin').fill(data.pin);
    }

    if (data.notes) {
      await this.driver.locator('#notes').fill(data.notes);
    }
  }

  async submitGiftCardForm() {
    const submitButton = this.driver.getByTestId('gift-card-form-submit');
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
    await this.driver.waitForNetworkIdle();
  }

  async expectGiftCardInList(merchant: string, amount?: number) {
    // Use .first() to handle cases where merchant appears in multiple places
    await this.expect(this.driver.getByText(merchant).first()).toBeVisible();

    if (amount !== undefined) {
      const formattedAmount = `$${amount.toFixed(2)}`;
      await this.expect(this.driver.getByText(formattedAmount).first()).toBeVisible();
    }
  }

  async expectGiftCardNotInList(merchant: string) {
    await this.expect(this.driver.getByText(merchant).first()).toBeHidden();
  }

  getGiftCardRow(merchant: string): Locator {
    return this.driver.getByTestId('merchant-row').filter({ hasText: merchant }).first();
  }

  async clickMerchant(merchant: string) {
    // Follow the merchant's row to its page
    const merchantCard = this.driver.getByText(merchant);
    await merchantCard.waitFor({ state: 'visible' });
    await merchantCard.click();
    await this.expectMerchantDetail(merchant);
    await this.driver.waitForNetworkIdle();
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
      editButton = this.driver.getByRole('button', { name: buttonName }).first();
    } else {
      editButton = this.driver.getByRole('button', { name: new RegExp(`Edit ${merchant}`, 'i') }).first();
    }

    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    // Wait for form to be visible
    await this.driver.locator('#merchant').waitFor({ state: 'visible' });

    // Fill in changed fields
    if (newData.merchant) {
      await this.driver.locator('#merchant').fill(newData.merchant);
    }

    if (newData.amount !== undefined) {
      await this.driver.locator('#amount').fill(newData.amount.toString());
    }

    if (newData.card_number) {
      await this.driver.locator('#card_number').fill(newData.card_number);
    }

    if (newData.pin) {
      await this.driver.locator('#pin').fill(newData.pin);
    }

    if (newData.notes) {
      await this.driver.locator('#notes').fill(newData.notes);
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
      deleteButton = this.driver.getByRole('button', {
        name: `Delete ${merchant} card ($${cardAmount.toFixed(2)})`
      }).first();
    } else {
      deleteButton = this.driver.getByRole('button', {
        name: new RegExp(`Delete ${merchant}`, 'i')
      }).first();
    }

    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

    // Deleting always asks for confirmation (ConfirmDialog in GiftCardHome).
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();

    // Wait for network to settle after deletion
    await this.driver.waitForNetworkIdle();
  }

  async expectMerchantSummary(merchant: string, totalAmount: number) {
    await this.expect(this.driver.getByText(merchant)).toBeVisible();
    const formattedTotal = `$${totalAmount.toFixed(2)}`;
    await this.expect(this.driver.getByText(formattedTotal)).toBeVisible();
  }
}
