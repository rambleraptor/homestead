/**
 * Documents Page Object Model.
 *
 * Covers the two screens: the index (upload dropzone + one row per document,
 * showing just name + type) and a document's detail page (its parsed fields,
 * full text, and the edit form). A row is located by its title, since that's
 * what a user reads; fields and status are asserted on `data-testid`s.
 *
 * Written against the shared `Driver`, so it runs on the VM tier (`../vm/`)
 * and, via `playwrightDriver(page)`, in Playwright. Drawing a redaction box
 * needs real layout and a mouse, so that step lives in redaction.spec.ts.
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class DocumentsPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto(): Promise<void> {
    await this.driver.goto('/documents');
  }

  /** Upload a file via the real (hidden) input the dropzone button drives. */
  async uploadFile(name: string, mimeType: string, contents: string): Promise<void> {
    await this.driver
      .getByTestId('document-file-input')
      .setInputFiles({ name, mimeType, buffer: new TextEncoder().encode(contents) });
  }

  /** "Take a photo": the camera input the touch-only button drives. */
  async takePhoto(name: string, contents: string): Promise<void> {
    await this.driver
      .getByTestId('document-camera-input')
      .setInputFiles({ name, mimeType: 'image/jpeg', buffer: new TextEncoder().encode(contents) });
  }

  // --- Redaction ------------------------------------------------------------

  /** Choose a file for the "Redact & upload" path; opens the redaction editor. */
  async pickRedactFile(name: string, mimeType: string, buffer: Uint8Array): Promise<void> {
    await this.driver
      .getByTestId('document-redact-input')
      .setInputFiles({ name, mimeType, buffer });
  }

  redactionEditor(): Locator {
    return this.driver.getByTestId('redaction-editor');
  }

  redactionSurface(): Locator {
    return this.driver.getByTestId('redaction-surface');
  }

  redactionRects(): Locator {
    return this.driver.getByTestId('redaction-rect');
  }

  async confirmRedaction(): Promise<void> {
    await this.driver.getByTestId('redaction-confirm').click();
  }

  // --- Index rows -----------------------------------------------------------

  /** The row whose title matches, regardless of its position in the list. */
  card(title: string): Locator {
    return this.driver
      .getByTestId('document-card')
      .filter({ has: this.driver.getByTestId('document-title').filter({ hasText: title }) });
  }

  /** The single row, when a test has created exactly one document. */
  onlyCard(): Locator {
    return this.driver.getByTestId('document-card');
  }

  /** The row's parse badge — present only while reading, or after it failed. */
  status(title: string): Locator {
    return this.card(title).getByTestId('document-status');
  }

  /** The row's type label — present only once a document matched a type. */
  type(title: string): Locator {
    return this.card(title).getByTestId('document-type');
  }

  /** The matched type's icon — on the row's tile, once a document is parsed. */
  typeIcon(title: string): Locator {
    return this.card(title).getByTestId('document-type-icon');
  }

  /**
   * Open a document's detail page by clicking its row. Targets the row's link
   * region specifically — the row also carries action buttons, and a click on
   * the card as a whole shouldn't have to depend on where its centre lands.
   */
  async open(title: string): Promise<void> {
    await this.card(title).getByTestId('document-open').click();
  }


  async expectEmpty(): Promise<void> {
    await this.expect(this.driver.getByTestId('documents-empty')).toBeVisible();
  }

  // --- Index filters --------------------------------------------------------

  /** Type into the free-text search box. */
  async search(text: string): Promise<void> {
    await this.driver.getByTestId('document-search').fill(text);
  }

  /** Select a document type by its visible label (e.g. "Form 1099-INT"). */
  async filterByType(label: string): Promise<void> {
    await this.driver.getByTestId('document-type-filter').selectOption({ label });
  }

  /** Select a person by name. */
  async filterByPerson(name: string): Promise<void> {
    await this.driver.getByTestId('document-person-filter').selectOption({ label: name });
  }

  /** Reset every filter via the Clear button. */
  async clearFilters(): Promise<void> {
    await this.driver.getByTestId('document-filters-clear').click();
  }

  /** The "no documents match your filters" placeholder. */
  noMatches(): Locator {
    return this.driver.getByTestId('documents-no-matches');
  }

  // --- Detail page ----------------------------------------------------------

  detail(): Locator {
    return this.driver.getByTestId('document-detail');
  }

  detailType(): Locator {
    return this.detail().getByTestId('document-type');
  }

  detailStatus(): Locator {
    return this.detail().getByTestId('document-status');
  }

  /** A parsed metadata field, rendered from the doc type's declaration. */
  detailField(fieldName: string): Locator {
    return this.detail().getByTestId(`document-field-${fieldName}`);
  }

  /** The free-form facts read off an unmatched document, one per row. */
  detailFacts(): Locator {
    return this.detail().getByTestId('document-fact');
  }

  async edit(): Promise<void> {
    await this.detail().getByTestId('document-edit').click();
  }

  async setTitle(title: string): Promise<void> {
    await this.driver.getByTestId('document-edit-title').fill(title);
  }

  editField(fieldName: string): Locator {
    return this.driver.getByTestId(`document-edit-field-${fieldName}`).locator('input');
  }

  /** In the edit form, pick a document type by its id (e.g. "warranty"). */
  async chooseType(docTypeId: string): Promise<void> {
    await this.driver.getByTestId('document-edit-type').click();
    await this.driver.getByTestId(`doc-type-option-${docTypeId}`).click();
  }

  async save(): Promise<void> {
    await this.driver.getByTestId('document-edit-save').click();
  }
}
