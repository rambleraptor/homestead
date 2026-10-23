/**
 * AEP-151 long-running operations, on the VM tier.
 *
 * A port of tests/e2e/tests/operations/operations.spec.ts. Drives a real async
 * method — `documents:classify` — end to end: the call returns 202 + an
 * operation, the AI classification runs in the background, and the
 * superuser-only Operations app tracks it. The AI provider is the e2e stub
 * (tests/e2e/config/ai-stub.ts), served in-process by the VM; its deliberate
 * delay is what keeps the operation observably `running`.
 *
 * Operations are a top-level, household-shared collection (not user-scoped), so
 * a regular user can spawn one and a superuser sees it in the Operations app.
 * Each test boots from a fresh database, so there is nothing to clear.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { OperationsPage } from '../e2e/pages/OperationsPage';
import { listOrEmpty } from '../e2e/utils/aepbase-helpers';
import {
  classifyDocument,
  listOperations,
  uploadDocument,
  type DocumentKind,
} from '../../packages/homestead-apps/documents/e2e/helpers';

interface OperationRecord {
  id: string;
  done: boolean;
  status?: string;
  title?: string;
  response?: { doc_type?: string; parse_status?: string; message?: string };
}

const OPERATIONS = 'operations';

/**
 * The AI stub's deliberate delay plus the Operations page's poll interval
 * outlast Vitest's 5s default, so give each test Playwright's 30s budget.
 */
const OPERATION_TEST_TIMEOUT_MS = 30_000;

describe('Operations (AEP-151)', { timeout: OPERATION_TEST_TIMEOUT_MS }, () => {
  let h: Harness;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    userToken = h.member.token;
  });

  afterEach(async () => {
    await h.close();
  });

  /**
   * Upload a document and invoke the real async classify method on it; returns
   * the 202 operation it spawned. `kind` steers the AI stub (see ai-stub.ts).
   */
  async function startClassify(token: string, kind: DocumentKind): Promise<OperationRecord> {
    const doc = await uploadDocument(token, kind, { title: `${kind}-doc` });
    const { status, operation } = await classifyDocument(token, doc.id);
    expect(status).toBe(202);
    expect(operation?.done).toBe(false);
    return operation as OperationRecord;
  }

  test('the Operations page tracks a real classification to completion', async () => {
    await h.loginAs(h.admin);
    // A regular member kicks off the classify; the superuser watches it land.
    const operation = await startClassify(userToken, 'match');

    const operations = new OperationsPage(h.driver);
    await operations.goto();

    // The page lists it under the method's declared title, still running.
    const row = operations.operationRow(operation.id);
    await h.driver.expect(row).toBeVisible({ timeout: 30_000 });
    await h.driver.expect(row).toContainText('Classify document');
    await h.driver.expect(row).toContainText(/running/i);

    // The background classification finishes; the polling UI notices.
    await h.driver.expect(row).toContainText(/completed/i, { timeout: 20_000 });
  });

  test('a completed operation carries the classification as its response', async () => {
    const operation = await startClassify(userToken, 'match');

    // Poll the operation the way a client does, until it settles.
    await expect
      .poll(
        async () => {
          const [record] = (await listOrEmpty<OperationRecord>(userToken, OPERATIONS)).filter(
            (o) => o.id === operation.id,
          );
          return record?.done ?? false;
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    const [settled] = (await listOrEmpty<OperationRecord>(userToken, OPERATIONS)).filter(
      (o) => o.id === operation.id,
    );
    expect(settled.status).toBe('succeeded');
    expect(settled.response?.doc_type).toBe('form-1099-int');
    expect(settled.response?.parse_status).toBe('parsed');
  });

  test('a classification that fails surfaces the error on the operation', async () => {
    await h.loginAs(h.admin);
    // The stub returns a schema-violating object for this document, so the real
    // handler throws and the failure lands on the operation.
    const operation = await startClassify(userToken, 'fail');

    const operations = new OperationsPage(h.driver);
    await operations.goto();

    const row = operations.operationRow(operation.id);
    await h.driver.expect(row).toBeVisible({ timeout: 30_000 });
    await h.driver.expect(row).toContainText(/failed/i, { timeout: 20_000 });
  });

  test('an async method rejected pre-flight returns an error, not an operation', async () => {
    // AEP-151: errors that stop the operation starting are ordinary error
    // responses. An unsupported mime type fails `validate` before anything
    // exists — a plain 400, not a 202 followed by a failed operation.
    const doc = await uploadDocument(userToken, 'match', {
      title: 'zip-doc',
      mimeType: 'application/zip',
    });

    // Snapshot immediately before the call, so the window the count spans is
    // just the classify itself — an unrelated operation (e.g. the cleanup cron's
    // own) can't slip in between the two reads and skew the delta.
    const before = await listOperations(userToken);
    const { status } = await classifyDocument(userToken, doc.id);
    expect(status).toBe(400);

    const after = await listOperations(userToken);
    expect(after.length).toBe(before.length);
  });
});
