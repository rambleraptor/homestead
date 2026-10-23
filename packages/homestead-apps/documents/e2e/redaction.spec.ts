/**
 * Redaction E2E.
 *
 * The "Redact & upload" path rasterizes the file in the browser, lets the user
 * paint an opaque box over it, flattens the result, and hands that flattened
 * File to the same upload flow the plain button uses. This drives the real
 * canvas pipeline (jsdom can't) end to end: open a file, draw a box, confirm,
 * and see a document appear — proving the flattened file uploads through the
 * untouched flow.
 */

import { test } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import type { Page } from '@playwright/test';
import { playwrightDriver } from '../../../homestead-test-harness/driver/pw-driver';
import { DocumentsPage } from './DocumentsPage';
import { deleteAllDocuments, deleteAllOperations } from './helpers';

/** Make a real, decodable PNG in the browser so createImageBitmap can open it. */
async function makePng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#3366cc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 20, 60, 20); // a "sensitive" strip to cover
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(base64, 'base64');
}

/** Drag a rectangle across the middle of the page to redact a region. */
async function drawRedaction(page: Page): Promise<void> {
  const box = await page.getByTestId('redaction-surface').boundingBox();
  if (!box) throw new Error('redaction surface has no bounding box');
  const x1 = box.x + box.width * 0.25;
  const y1 = box.y + box.height * 0.25;
  const x2 = box.x + box.width * 0.7;
  const y2 = box.y + box.height * 0.6;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

test.describe('Document redaction', () => {
  test.beforeEach(async ({ userToken }) => {
    await deleteAllDocuments(userToken);
    await deleteAllOperations(userToken);
  });

  test.afterEach(async ({ userToken }) => {
    await deleteAllDocuments(userToken);
    await deleteAllOperations(userToken);
  });

  test('redact & upload flattens a file client-side, then uploads it through the normal flow', async ({
    authenticatedPage,
  }) => {
    const documents = new DocumentsPage(playwrightDriver(authenticatedPage));
    await documents.goto();
    await documents.expectEmpty();

    const png = await makePng(authenticatedPage);
    await documents.pickRedactFile('secret.png', 'image/png', png);

    // Editor opens on the rasterized page.
    await documents.driver.expect(documents.redactionEditor()).toBeVisible();
    await documents.driver.expect(documents.redactionSurface()).toBeVisible();

    // Draw one redaction box; it renders as a committed rectangle.
    await drawRedaction(authenticatedPage);
    await documents.driver.expect(documents.redactionRects()).toHaveCount(1);

    // Confirming flattens and uploads via the same mutation the plain path uses.
    await documents.confirmRedaction();
    await documents.driver.expect(documents.redactionEditor()).toBeHidden();

    // The flattened document lands in the list through the untouched upload flow.
    const card = documents.onlyCard();
    await documents.driver.expect(card).toBeVisible();
    await documents.driver.expect(card.getByTestId('document-title')).toContainText('secret');
  });

  test('cancelling the editor uploads nothing', async ({ authenticatedPage }) => {
    const documents = new DocumentsPage(playwrightDriver(authenticatedPage));
    await documents.goto();
    await documents.expectEmpty();

    const png = await makePng(authenticatedPage);
    await documents.pickRedactFile('secret.png', 'image/png', png);
    await documents.driver.expect(documents.redactionEditor()).toBeVisible();

    await authenticatedPage.getByTestId('redaction-cancel').click();
    await documents.driver.expect(documents.redactionEditor()).toBeHidden();
    await documents.expectEmpty();
  });
});
