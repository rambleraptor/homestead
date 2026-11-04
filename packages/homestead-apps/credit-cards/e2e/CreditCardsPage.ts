/**
 * Page Object for the Credit Cards app.
 *
 * Encapsulates the card → perk → redemption nested flow across the app's
 * routes: the list (`/credit-cards`), the form (`/credit-cards/new`,
 * `/credit-cards/:id/edit`) and a card's own page (`/credit-cards/:id`).
 * Perks and redemptions are aepbase children of a credit-card, so exercising
 * this UI drives the generic offline mutation factory's convention-based
 * nesting (create/update/delete/redeem across two levels of parent).
 *
 * Written against the shared `Driver`, so the same page object drives both the
 * Playwright suite (`playwrightDriver(page)`) and the in-process VM tier
 * (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class CreditCardsPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto(): Promise<void> {
    await this.driver.goto('/credit-cards');
    await this.expectList();
  }

  /** Open a card's page directly, as a shared link or a reload would. */
  async gotoCard(id: string): Promise<void> {
    await this.driver.goto(`/credit-cards/${id}`);
  }

  async expectList(): Promise<void> {
    await this.expect(
      this.driver.getByRole('heading', { name: 'Credit Cards' }),
    ).toBeVisible();
  }

  // ---- cards --------------------------------------------------------------

  cardRow(name: string): Locator {
    return this.driver
      .locator('[data-testid^="card-row-"]')
      .filter({ hasText: name });
  }

  /** The card's page: its title, with the perks section ready. */
  async expectCardDetail(name: string): Promise<void> {
    await this.expect(this.driver.getByTestId('credit-card-detail')).toBeVisible();
    await this.expect(this.driver.getByRole('heading', { name })).toBeVisible();
    await this.expect(this.driver.getByTestId('add-perk-button')).toBeVisible();
  }

  /** Fill and submit the card form. Saving lands on the new card's page. */
  async addCard(opts: {
    name: string;
    issuer: string;
    annualFee: number;
    anniversary: string; // yyyy-mm-dd
  }): Promise<void> {
    await this.driver.getByTestId('add-credit-card-button').click();
    await this.driver.expectURL(/\/credit-cards\/new$/);
    await this.expect(this.driver.getByTestId('credit-card-form')).toBeVisible();
    await this.driver.locator('#card-name').fill(opts.name);
    await this.driver.locator('#card-issuer').fill(opts.issuer);
    await this.driver.locator('#card-annual-fee').fill(String(opts.annualFee));
    await this.driver.locator('#card-anniversary').fill(opts.anniversary);
    await this.driver.getByTestId('credit-card-form-submit').click();
    await this.expectCardDetail(opts.name);
  }

  /** From the list, follow a card's tile to its page. */
  async openCard(name: string): Promise<void> {
    await this.cardRow(name).click();
    await this.expectCardDetail(name);
  }

  /** From a card's page, back to the list. */
  async backToList(): Promise<void> {
    await this.driver.getByTestId('card-detail-back').click();
    await this.expectList();
  }

  /** From a card's page, open its edit form. */
  async editCardFromDetail(): Promise<void> {
    await this.driver.getByTestId('edit-card-detail').click();
    await this.expect(this.driver.getByTestId('credit-card-form')).toBeVisible();
  }

  /** From a card's page, delete it (confirming the dialog). */
  async deleteCardFromDetail(): Promise<void> {
    await this.driver.getByTestId('delete-card-detail').click();
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();
  }

  // ---- perks (nested under a card) ---------------------------------------

  perkRow(name: string): Locator {
    return this.driver
      .locator('[data-testid^="perk-row-"]')
      .filter({ hasText: name });
  }

  async addPerk(opts: {
    name: string;
    value: number;
    frequency?: 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
  }): Promise<void> {
    await this.driver.getByTestId('add-perk-button').click();
    await this.expect(this.driver.getByTestId('perk-form')).toBeVisible();
    await this.driver.locator('#perk-name').fill(opts.name);
    await this.driver.locator('#perk-value').fill(String(opts.value));
    if (opts.frequency) {
      await this.driver.locator('#perk-frequency').selectOption(opts.frequency);
    }
    await this.driver.getByTestId('perk-form-submit').click();
    await this.expect(this.perkRow(opts.name)).toBeVisible();
  }

  async editPerkValue(name: string, newValue: number): Promise<void> {
    await this.perkRow(name)
      .locator('[data-testid^="edit-perk-"]')
      .click();
    await this.expect(this.driver.getByTestId('perk-form')).toBeVisible();
    await this.driver.locator('#perk-value').fill(String(newValue));
    await this.driver.getByTestId('perk-form-submit').click();
    await this.expect(this.driver.getByTestId('perk-form')).toBeHidden();
  }

  async redeemPerk(name: string): Promise<void> {
    await this.perkRow(name)
      .locator('[data-testid^="redeem-perk-"]')
      .click();
  }

  async deletePerk(name: string): Promise<void> {
    await this.perkRow(name)
      .locator('[data-testid^="delete-perk-"]')
      .click();
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();
  }

  /** The perk row's derived redemption status: 'none' | 'partial' | 'full'. */
  async perkRedemptionStatus(name: string): Promise<string | null> {
    return this.perkRow(name).getAttribute('data-redemption-status');
  }

  /** The "All perks used" celebration, when a redemption completes the card. */
  get celebration(): Locator {
    return this.driver.getByTestId('celebration-toast');
  }
}
