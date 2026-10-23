/**
 * Charitable tab Page Object.
 *
 * The tab lives at `/receipts?tab=charitable`, and its year lives in the URL
 * beside it — so `goto` takes an optional year and the assertions read whatever
 * year the page resolved.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class CharitablePage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto(year?: number) {
    const suffix = year ? `&year=${year}` : '';
    await this.driver.goto(`/receipts?tab=charitable${suffix}`);
    await this.driver.getByTestId('receipts-tab-charitable').waitFor({ state: 'visible' });
  }

  /** Reach the tab the way a reader does, rather than by URL. */
  async goViaTab() {
    await this.driver.goto('/receipts');
    await this.driver.getByTestId('receipts-tab-charitable').click();
  }

  async clickAddDonation() {
    const addButton = this.driver.getByTestId('add-charitable-receipt-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillDonationForm(data: {
    organization: string;
    donation_date: string;
    gift_type?: 'Cash' | 'Goods' | 'Other';
    amount?: number;
    value_received?: number;
    donor?: string;
    notes?: string;
  }) {
    await this.driver.locator('#organization').fill(data.organization);
    await this.driver.locator('#donation_date').fill(data.donation_date);
    if (data.gift_type) {
      await this.driver.locator('#gift_type').selectOption(data.gift_type);
    }
    if (data.amount !== undefined) {
      await this.driver.locator('#amount').fill(String(data.amount));
    }
    if (data.value_received !== undefined) {
      await this.driver.locator('#value_received').fill(String(data.value_received));
    }
    if (data.donor) {
      await this.driver.locator('#donor').fill(data.donor);
    }
    if (data.notes) {
      await this.driver.locator('#notes').fill(data.notes);
    }
  }

  async submitDonationForm() {
    const submitButton = this.driver.getByTestId('charitable-receipt-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createDonation(data: Parameters<CharitablePage['fillDonationForm']>[0]) {
    await this.clickAddDonation();
    await this.fillDonationForm(data);
    await this.submitDonationForm();
    await this.driver.waitForNetworkIdle();
  }

  /**
   * Scoped to the vault on purpose: the by-organization chart above it names
   * the same charities but answers a different question (it covers the whole
   * year, whatever the list is filtered to), so a page-wide text match would
   * read a filtered-out donation as still listed.
   */
  private vault() {
    return this.driver.getByTestId('charitable-vault');
  }

  async expectDonationInList(organization: string, amount?: number) {
    await this.expect(this.vault().getByText(organization).first()).toBeVisible();
    if (amount !== undefined) {
      await this.expect(
        this.vault().getByText(`$${amount.toFixed(2)}`).first(),
      ).toBeVisible();
    }
  }

  async expectDonationNotInList(organization: string) {
    await this.expect(this.vault().getByText(organization)).toHaveCount(0);
  }

  /** The hero total — what the year is worth as a deduction. */
  async expectDeductibleTotal(amount: number) {
    const kpi = this.driver.getByTestId('charitable-kpi');
    await this.expect(kpi.getByText(`$${amount.toFixed(2)}`)).toBeVisible();
  }

  async expectSelectedYear(year: number) {
    await this.expect(this.driver.getByTestId('charitable-year-select')).toHaveValue(
      String(year),
    );
  }

  async selectYear(year: number) {
    await this.driver.getByTestId('charitable-year-select').selectOption(String(year));
    await this.driver.waitForNetworkIdle();
  }

  /** Pick a year by clicking its row in the by-year table. */
  async selectYearFromTable(year: number) {
    await this.driver.getByTestId(`charitable-year-${year}`).click();
    await this.driver.waitForNetworkIdle();
  }

  async expectYearTotal(year: number, total: number) {
    // By test id rather than by text: a year whose giving was all cash shows the
    // same figure in its cash column and its total column.
    await this.expect(this.driver.getByTestId(`charitable-year-total-${year}`)).toHaveText(
      `$${total.toFixed(2)}`,
    );
  }

  /** A gift of goods nobody has valued shows this in place of an amount. */
  async expectNeedsValue(organization: string) {
    const row = this.vault().locator('tr').filter({ hasText: organization });
    await this.expect(row.getByText('Needs a value')).toBeVisible();
  }

  async markDonationClaimed(organization: string) {
    const markButton = this.driver.getByRole('button', {
      name: new RegExp(`Mark ${organization} donation as claimed`, 'i'),
    });
    await markButton.waitFor({ state: 'visible' });
    await markButton.click();
    await this.driver.waitForNetworkIdle();
  }

  async expectDonationStatus(organization: string, status: 'Unclaimed' | 'Claimed') {
    const row = this.vault().locator('tr').filter({ hasText: organization });
    await this.expect(row.getByText(status)).toBeVisible();
  }

  async filterByStatus(status: 'All' | 'Unclaimed' | 'Claimed') {
    const filter = this.driver.getByTestId('charitable-status-filter');
    await filter.waitFor({ state: 'visible' });
    await filter.selectOption(status);
    await this.driver.waitForNetworkIdle();
  }

  async filterBySource(source: 'All' | 'Self' | 'DAF') {
    const filter = this.driver.getByTestId('charitable-source-filter');
    await filter.waitFor({ state: 'visible' });
    await filter.selectOption(source);
  }

  async editDonation(
    organization: string,
    updates: { organization?: string; amount?: number; notes?: string },
  ) {
    const editButton = this.driver.getByRole('button', {
      name: new RegExp(`Edit ${organization} donation`, 'i'),
    });
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    const submit = this.driver.getByTestId('charitable-receipt-edit-submit');
    await submit.waitFor({ state: 'visible' });

    if (updates.organization !== undefined) {
      await this.driver.locator('#edit-organization').fill(updates.organization);
    }
    if (updates.amount !== undefined) {
      await this.driver.locator('#edit-amount').fill(String(updates.amount));
    }
    if (updates.notes !== undefined) {
      await this.driver.locator('#edit-notes').fill(updates.notes);
    }

    await submit.click();
    await submit.waitFor({ state: 'hidden' });
    await this.driver.waitForNetworkIdle();
  }

  async deleteDonation(organization: string) {
    const deleteButton = this.driver.getByRole('button', {
      name: new RegExp(`Delete ${organization} donation`, 'i'),
    });
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

    // Deleting always asks for confirmation (ConfirmDialog in CharitableTab).
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();
    await this.driver.waitForNetworkIdle();
  }

  async expectEmptyState() {
    await this.expect(this.driver.getByText(/no donations found/i)).toBeVisible();
  }
}
