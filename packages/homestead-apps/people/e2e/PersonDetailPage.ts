/**
 * Person Detail Page Object Model.
 *
 * Covers navigating to a person's detail page (directly or by clicking their
 * name in the list) and asserting the family and categorized documents shown
 * there.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class PersonDetailPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto(personId: string) {
    await this.driver.goto(`/people/${personId}`);
    await this.driver.getByTestId('person-detail').waitFor({ state: 'visible' });
  }

  /** Open the detail page by clicking a person's name link in the People list. */
  async openFromList(personName: string) {
    const link = this.driver.getByTestId('person-detail-link').filter({ hasText: personName });
    await link.first().click();
    await this.driver.getByTestId('person-detail').waitFor({ state: 'visible' });
  }

  async expectName(name: string) {
    await this.expect(
      this.driver.getByRole('heading', { level: 1, name }),
    ).toBeVisible();
  }

  private group(category: 'tax' | 'medical' | 'other'): Locator {
    return this.driver.getByTestId(`person-documents-group-${category}`);
  }

  /** A document with `title` appears under the given category section. */
  async expectDocumentInCategory(
    category: 'tax' | 'medical' | 'other',
    title: string,
  ) {
    const card = this.group(category).getByTestId('document-card').filter({ hasText: title });
    await this.expect(card).toBeVisible();
  }

  /** The Parents / Children / Siblings row lists exactly these names. */
  async expectFamily(group: 'parents' | 'children' | 'siblings', names: string[]) {
    const links = this.driver.getByTestId(`person-family-${group}`).getByRole('link');
    await this.expect(links).toHaveCount(names.length);
    for (const [i, name] of names.entries()) {
      await this.expect(links.nth(i)).toHaveText(name);
    }
  }

  async expectNoFamily() {
    await this.expect(this.driver.getByTestId('person-family')).toHaveCount(0);
  }

  /** The households card (partner, addresses, WiFi) shows this text. */
  async expectHouseholdDetail(text: string) {
    await this.expect(this.driver.getByTestId('person-households')).toContainText(text);
  }

  /** Whether the page marks the person as having a Homestead account. */
  async expectHasAccount(has: boolean) {
    await this.expect(this.driver.getByTestId('person-has-account')).toHaveCount(has ? 1 : 0);
  }

  async expectNoDocuments() {
    await this.expect(this.driver.getByTestId('person-documents-empty')).toBeVisible();
  }
}
