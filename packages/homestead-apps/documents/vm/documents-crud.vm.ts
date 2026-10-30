/**
 * Documents, on the VM tier — a port of the Playwright documents-crud spec.
 *
 * Drives the real `documents:classify` async method end to end against the AI
 * stub (config/ai-stub.ts): upload a file, the classify call returns 202 + an
 * operation, the background parse writes the result back, and the list reflects
 * it. The stub is steered by the uploaded file's bytes — a `match` file parses
 * as a 1099-INT, `unknown` as unrecognised, `fail` throws in the model call.
 *
 * Documents are permission-governed (acl): each caller sees only their own,
 * plus anything shared with them. Each test seeds and views as the same user,
 * on a fresh database.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DOC_MARKERS } from '../../../../tests/e2e/config/ai-stub';
import { DocumentsPage } from '../e2e/DocumentsPage';
import {
  classifyDocument,
  classifyDocumentAs,
  listDocuments,
  listOperations,
  uploadAndClassify,
  uploadDocument,
  waitForParse,
} from '../e2e/helpers';

// Each classify waits on the AI stub (~2.5s per model pass), so give every test
// Playwright's default 30s budget rather than Vitest's 5s.
const CLASSIFY_TEST_TIMEOUT_MS = 30_000;

describe('Documents', { timeout: CLASSIFY_TEST_TIMEOUT_MS }, () => {
  let h: Harness;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('uploading in the UI classifies a 1099, titles it, and renders its fields on the detail page', async () => {
    const documents = new DocumentsPage(h.driver);
    await documents.goto();
    await documents.expectEmpty();

    // A file whose bytes are the "match" marker: the stub reads it as a 1099-INT.
    await documents.uploadFile('form-1099.pdf', 'application/pdf', DOC_MARKERS.match);

    // The row appears immediately (pending) and the polling list resolves it.
    // Once parsed, the row swaps the "Reading…" badge for the matched type's
    // icon, so its presence is the signal that classification finished.
    const card = documents.onlyCard();
    await h.driver.expect(card).toBeVisible();
    await h.driver.expect(card.getByTestId('document-type-icon')).toBeVisible({
      timeout: 30_000,
    });

    // The index shows only name + type. The title is now AI-inferred (it was the
    // filename while pending); the type label comes from the doc type's `label`.
    await h.driver.expect(card.getByTestId('document-title')).toContainText('1099-INT (2025) — Ally Bank');
    await h.driver.expect(card.getByTestId('document-type')).toContainText('Form 1099-INT');

    // The parsed fields live on the detail page, not the index row. (Playwright
    // clicks the card's centre, which lands on its link; with no layout here,
    // click that link — the row's `document-open` region — directly.)
    await card.getByTestId('document-open').click();
    await h.driver.expect(documents.detail()).toBeVisible();
    await h.driver.expect(documents.detailType()).toContainText('Form 1099-INT');

    // Fields are rendered from the doc type's declaration — label from `label`,
    // value from the parsed metadata. No component hardcodes what a 1099 is.
    await h.driver.expect(documents.detailField('payer_name')).toContainText('Payer name');
    await h.driver.expect(documents.detailField('payer_name')).toContainText('Ally Bank');
    await h.driver.expect(documents.detailField('box_1_interest')).toContainText(
      'Box 1: Interest income',
    );
    await h.driver.expect(documents.detailField('box_1_interest')).toContainText('412.55');
  });

  test('a photo taken with the camera is read like any upload', async () => {
    const documents = new DocumentsPage(h.driver);
    await documents.goto();
    await documents.expectEmpty();

    await documents.takePhoto('photo.jpg', DOC_MARKERS.match);

    const card = documents.onlyCard();
    await h.driver.expect(card.getByTestId('document-type-icon')).toBeVisible({
      timeout: 30_000,
    });
    await h.driver.expect(card.getByTestId('document-type')).toContainText('Form 1099-INT');
  });

  test('a document can be edited by hand from its detail page', async () => {
    // Seed a parsed 1099 via REST, then correct a field and the title in the UI.
    const doc = await uploadAndClassify(userToken, 'match', { title: 'ally-1099' });
    expect(doc.parse_status).toBe('parsed');

    const documents = new DocumentsPage(h.driver);
    await documents.goto();
    await documents.open('ally-1099');
    await h.driver.expect(documents.detail()).toBeVisible();

    await documents.edit();
    await documents.setTitle('Ally Bank interest 2025');
    await documents.editField('payer_name').fill('Ally Financial');
    await documents.save();

    // The edit form closes and the corrected values are shown.
    await h.driver.expect(documents.detailField('payer_name')).toContainText('Ally Financial');

    // The manual title persists across a reload (it was saved, not just local).
    await documents.goto();
    await h.driver.expect(documents.card('Ally Bank interest 2025')).toBeVisible();
  });

  test('a document matching no known type is quiet in the list, and unmatched (not failed) on its page', async () => {
    const doc = await uploadAndClassify(userToken, 'unknown', { title: 'mystery-letter' });
    expect(doc.parse_status).toBe('unmatched');
    expect(doc.metadata?.doc_type).toBe('unknown');
    expect(doc.metadata?.facts).toEqual([
      { label: 'Account Number', value: 'AC-20931' },
      { label: 'Support Phone', value: '1-800-555-0142' },
    ]);

    const documents = new DocumentsPage(h.driver);
    await documents.goto();

    // The index states no classification for it — no type line and no badge.
    // Not having one is the ordinary case for household paper, and a badge for
    // it read like an error to fix.
    const card = documents.card('mystery-letter');
    await h.driver.expect(card).toBeVisible({ timeout: 30_000 });
    await h.driver.expect(documents.type('mystery-letter')).toHaveCount(0);
    await h.driver.expect(documents.status('mystery-letter')).toHaveCount(0);

    // The detail page, where it can be corrected, still names the state, and
    // shows the facts read off it in place of a type's fields.
    await documents.open('mystery-letter');
    await h.driver.expect(documents.detailStatus()).toContainText(/no matching type/i);
    await h.driver.expect(documents.detailFacts()).toHaveCount(2);
    await h.driver.expect(documents.detailFacts().first()).toContainText('Account Number');
    await h.driver.expect(documents.detailFacts().first()).toContainText('AC-20931');

    // A hand edit keeps the facts...
    await documents.edit();
    await documents.setTitle('Acme account letter');
    await documents.save();
    await h.driver.expect(documents.detailFacts()).toHaveCount(2);

    // ...until it gives the document a real type, whose fields replace them.
    await documents.edit();
    await documents.chooseType('warranty');
    await documents.save();
    await h.driver.expect(documents.detailFacts()).toHaveCount(0);
    const [saved] = await listDocuments(userToken, "metadata.doc_type == 'warranty'");
    expect(saved?.metadata).toEqual({ doc_type: 'warranty' });
  });

  test('the index filters by search, type, and person', async () => {
    // A parsed 1099 (recipient "Alex Stephen", per the AI stub) and an unmatched
    // letter — enough to exercise all three filters against distinct rows.
    const parsed = await uploadAndClassify(userToken, 'match', { title: 'ally-1099' });
    const unmatched = await uploadAndClassify(userToken, 'unknown', {
      title: 'mystery-letter',
    });
    expect(parsed.parse_status).toBe('parsed');
    expect(unmatched.parse_status).toBe('unmatched');

    const documents = new DocumentsPage(h.driver);
    await documents.goto();
    await h.driver.expect(documents.card('ally-1099')).toBeVisible();
    await h.driver.expect(documents.card('mystery-letter')).toBeVisible();

    // Search narrows to the matching title.
    await documents.search('ally');
    await h.driver.expect(documents.card('ally-1099')).toBeVisible();
    await h.driver.expect(documents.card('mystery-letter')).toHaveCount(0);

    // Search also reaches parsed metadata (the payer name from the 1099).
    await documents.search('Ally Bank');
    await h.driver.expect(documents.card('ally-1099')).toBeVisible();

    // ...and an unmatched document's free-form facts (its account number).
    await documents.search('AC-20931');
    await h.driver.expect(documents.card('mystery-letter')).toBeVisible();
    await h.driver.expect(documents.card('ally-1099')).toHaveCount(0);

    await documents.clearFilters();
    await h.driver.expect(documents.card('mystery-letter')).toBeVisible();

    // Type filter keeps only the 1099; the unmatched letter drops out.
    await documents.filterByType('Form 1099-INT');
    await h.driver.expect(documents.card('ally-1099')).toBeVisible();
    await h.driver.expect(documents.card('mystery-letter')).toHaveCount(0);

    await documents.clearFilters();

    // Person filter — "Alex Stephen" is derived from the 1099's recipient_name,
    // not stored; the unmatched letter names no one, so it drops out.
    await documents.filterByPerson('Alex Stephen');
    await h.driver.expect(documents.card('ally-1099')).toBeVisible();
    await h.driver.expect(documents.card('mystery-letter')).toHaveCount(0);

    // A filter that matches nothing shows the no-matches placeholder.
    await documents.clearFilters();
    await documents.search('nothing-matches-this-xyz');
    await h.driver.expect(documents.noMatches()).toBeVisible();
  });

  test('parsed metadata is filterable through the union columns', async () => {
    const parsed = await uploadAndClassify(userToken, 'match', { title: 'ally-1099' });
    const unmatched = await uploadAndClassify(userToken, 'unknown', { title: 'a-letter' });
    expect(parsed.parse_status).toBe('parsed');

    // Filter on the discriminator tag — a Phase 1 derived column.
    const byType = await listDocuments(userToken, "metadata.doc_type == 'form-1099-int'");
    expect(byType.map((d) => d.id)).toContain(parsed.id);
    expect(byType.map((d) => d.id)).not.toContain(unmatched.id);

    // Filter on a variant field, numerically.
    const overHundred = await listDocuments(userToken, 'metadata.box_1_interest > 100');
    expect(overHundred.map((d) => d.id)).toContain(parsed.id);

    const overThousand = await listDocuments(userToken, 'metadata.box_1_interest > 1000');
    expect(overThousand.map((d) => d.id)).not.toContain(parsed.id);
  });

  test('classify rejects an unsupported file type pre-flight, creating no operation', async () => {
    // Stored with an unsupported mime, so `validate` rejects before an operation
    // exists — an ordinary 400, not a 202 followed by a failed operation.
    const doc = await uploadDocument(userToken, 'match', {
      title: 'a-zip',
      mimeType: 'application/zip',
    });
    const before = (await listOperations(userToken)).length;

    const { status } = await classifyDocument(userToken, doc.id);
    expect(status).toBe(400);

    const after = (await listOperations(userToken)).length;
    expect(after).toBe(before);
  });

  test('forcing a doc type skips the AI guess and extracts that type', async () => {
    const doc = await uploadDocument(userToken, 'match', { title: 'forced-1099' });

    const { status } = await classifyDocumentAs(userToken, doc.id, 'form-1099-int');
    expect(status).toBe(202);

    const settled = await waitForParse(userToken, doc.id);
    expect(settled.parse_status).toBe('parsed');
    expect(settled.metadata?.doc_type).toBe('form-1099-int');
    // Full confidence is the forced-path signal: automatic classify would record
    // the stub's pass-1 0.95, which forcing skips entirely.
    expect(settled.confidence).toBe(1);
    // Extraction (pass 2) still ran for the forced type.
    expect(settled.metadata?.payer_name).toBe('Ally Bank');
  });

  test('forcing an unknown doc type is rejected pre-flight, creating no operation', async () => {
    const doc = await uploadDocument(userToken, 'match', { title: 'bad-force' });
    const before = (await listOperations(userToken)).length;

    const { status } = await classifyDocumentAs(userToken, doc.id, 'not-a-real-type');
    expect(status).toBe(400);

    const after = (await listOperations(userToken)).length;
    expect(after).toBe(before);
  });

  test('a model failure marks the document failed', async () => {
    // The "fail" marker makes the stub return a schema-invalid object, so the
    // real extraction throws and the failure lands on the document.
    const doc = await uploadDocument(userToken, 'fail', { title: 'broken-scan' });
    const { status } = await classifyDocument(userToken, doc.id);
    expect(status).toBe(202);

    const settled = await waitForParse(userToken, doc.id);
    expect(settled.parse_status).toBe('failed');
  });
});
