/**
 * `documents/{id}:split` async custom method (AEP-136 + AEP-151).
 *
 * Splits a *bundle* PDF — one file that is really several separate documents
 * stapled together — into one `documents` record per constituent form. The
 * canonical case is a tax return: a Form 1040 followed by its W-2s, 1099s, and
 * supporting schedules, each really its own document. Each piece is then fed
 * through the ordinary `classify` pipeline, so a child 1099-INT is classified
 * and extracted exactly as if it had been uploaded on its own.
 *
 * This is deliberately a *separate* method from `classify`, not a branch inside
 * it: a normal single-document upload never runs any of this code. The simple
 * path is untouched — splitting only happens when the caller explicitly asks.
 *
 * Flow: read the stored PDF, ask the model for the page range of each distinct
 * document inside it (one vision pass), cut the PDF at those boundaries with
 * pdf-lib, create a child record for each piece (tagged so the whole return
 * groups together in the list), and kick off `classify` on each.
 *
 * Long-running (a vision pass over a whole return is slow), so it returns 202
 * with an Operation and runs the work in the background, mirroring `classify`.
 * The bundle record is kept — it's the original combined file, useful as the
 * archival copy — but marked `unmatched` (it matches no single type) and tagged
 * into the group alongside its pieces.
 */

import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import type {
  AsyncCustomMethodHandler,
  AsyncCustomMethodValidator,
} from '@rambleraptor/homestead-core/resources/types';
import { isAiConfigured } from '@rambleraptor/homestead-core/server/ai/config';
import {
  aiGenerateObject,
  type ModelMessage,
} from '@rambleraptor/homestead-core/server/ai/generate';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { sha256Hex } from '@rambleraptor/homestead-core/server/hash';
import { HomesteadError } from '@rambleraptor/homestead-client';
import { DOCUMENTS } from '../resources';
import { replaceMetadata, UNKNOWN_DOC_TYPE } from '../doc-types/docType';
import {
  childFilename,
  groupTag,
  normalizeTaxYear,
  planSegments,
} from './split-plan';
import type { Document } from '../types';

/** Splitting is a PDF-only operation: images are a single page, one document. */
const PDF_MIME = 'application/pdf';

/**
 * Room for the answer. The response is a short list of page ranges, so this is
 * generous — a cap is a ceiling, not a spend.
 */
const MAX_OUTPUT_TOKENS = 8192;

function splitPrompt(pageCount: number): string {
  return `This is a single PDF that may be a *bundle* — several separate
documents combined into one file. The classic example is a tax return: a Form
1040 followed by its W-2s, 1099s, and supporting schedules, each really its own
document.

The PDF has ${pageCount} page(s). Identify the page range of each distinct
document inside it.

Rules:
- Give every document a "start_page" and "end_page", 1-based and inclusive. A
  single-page document has start_page == end_page.
- Ranges must be in reading order and must not overlap. Together they should
  cover the whole PDF — do not skip pages.
- Start a new document wherever the form, issuer, or purpose clearly changes: a
  new tax form number, a different payer, a fresh statement.
- Give each a short "title" naming what it is, e.g. "W-2 — Acme Corp" or
  "1099-INT — Pecan Street Credit Union". Use null only if you truly can't tell.
- If the PDF is really just ONE document, return a single entry spanning all
  ${pageCount} pages.

Also set "tax_year" to the four-digit year this return is for if it is a tax
return (e.g. "2024"), or null if it isn't a tax return or the year isn't shown.`;
}

const detectSchema = z.object({
  tax_year: z
    .string()
    .nullable()
    .describe('Four-digit tax year if this is a tax return, else null.'),
  documents: z
    .array(
      z.object({
        start_page: z.number().describe('1-based first page (inclusive).'),
        end_page: z.number().describe('1-based last page (inclusive).'),
        title: z
          .string()
          .nullable()
          .describe('Short label for this document, or null if unknown.'),
      }),
    )
    .describe('Each distinct document inside the bundle, in page order.'),
});

export const validate: AsyncCustomMethodValidator = async ({ id, auth }) => {
  if (!isAiConfigured()) {
    return Response.json(
      { error: 'Service unavailable', message: 'AI is not configured on the server' },
      { status: 503 },
    );
  }
  if (!id) {
    return Response.json(
      { error: 'Bad request', message: 'split is addressed on a single document' },
      { status: 400 },
    );
  }

  // Fetch up front so a missing record is a 404 rather than a failed operation.
  let doc: Document;
  try {
    doc = await serverClient(auth.token).collection<Document>(DOCUMENTS).get(id);
  } catch {
    return Response.json(
      { error: 'Not found', message: `document ${id} not found` },
      { status: 404 },
    );
  }
  if (doc.mime_type && doc.mime_type !== PDF_MIME) {
    return Response.json(
      {
        error: 'Bad request',
        message: `split only applies to PDFs — "${doc.mime_type}" is a single-page file`,
      },
      { status: 400 },
    );
  }
};

const handler: AsyncCustomMethodHandler = async ({ id, auth, log }) => {
  const docId = id!;
  const documents = serverClient(auth.token).collection<Document>(DOCUMENTS);
  const bundle = await documents.get(docId);

  // The stored bytes, pulled back over loopback as the caller (decrypted by the
  // engine's `:download` if encrypted at rest).
  let bytes: Buffer;
  try {
    const blob = await documents.record(docId).download('file');
    bytes = Buffer.from(await blob.arrayBuffer());
  } catch (err) {
    const detail = err instanceof HomesteadError ? err.code : err;
    throw new Error(`could not read the document's file: ${detail}`);
  }

  // Mark the bundle failed only when it has no prior verdict to lose — a
  // bundle-upload arrives `pending`, so a failure there should surface as
  // failed; splitting an already-classified document must not clobber its
  // status. Either way the operation records the real error.
  const failSplit = async (err: unknown): Promise<never> => {
    console.error(
      `[documents] split failed for ${docId} ` +
        `(mime=${bundle.mime_type ?? 'unknown'}, bytes=${bytes.length})`,
    );
    if (bundle.parse_status === 'pending') {
      await documents.record(docId).update({ parse_status: 'failed' });
    }
    throw err;
  };

  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (err) {
    return failSplit(
      new Error(
        'could not open the PDF — it may be password-protected or corrupt: ' +
          (err instanceof Error ? err.message : String(err)),
      ),
    );
  }
  const pageCount = source.getPageCount();
  await log?.(`bundle has ${pageCount} page(s)`);

  // One vision pass over the whole PDF, asking only for boundaries — type
  // detection and field extraction stay the per-child classify's job.
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: splitPrompt(pageCount) },
        { type: 'file', data: bytes.toString('base64'), mediaType: PDF_MIME },
      ],
    },
  ];

  let detected: z.infer<typeof detectSchema>;
  try {
    detected = await aiGenerateObject({
      messages,
      schema: detectSchema,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (err) {
    return failSplit(err);
  }

  const planned = planSegments(detected.documents, pageCount);

  // Not actually a bundle (the model found one document, or none it could place).
  // Leave the file as a single document. If it arrived unclassified (the
  // bundle-upload path fires only split), fall back to the normal classify so it
  // still gets read — this is the "user split a plain document by mistake" case.
  if (planned.length < 2) {
    if (bundle.parse_status === 'pending') {
      try {
        await documents.record(docId).invoke('classify', {});
      } catch (err) {
        console.error(`[documents] classify fallback failed for ${docId}`, err);
      }
    }
    await log?.('only one document found; nothing to split');
    return {
      split: false,
      pages: pageCount,
      message: 'This looks like a single document — nothing to split.',
    };
  }

  const year = normalizeTaxYear(detected.tax_year);
  const tag = groupTag(year);
  await log?.(
    `splitting into ${planned.length} document(s)${year ? ` for tax year ${year}` : ''}`,
  );

  // Cut each piece into its own PDF and file it as a child document, then start
  // its classification. A child is a single form, so the ordinary classify
  // pipeline reads it exactly as a standalone upload would.
  const created: string[] = [];
  for (const seg of planned) {
    const child = await PDFDocument.create();
    const pages = await child.copyPages(source, seg.pageIndices);
    pages.forEach((page) => child.addPage(page));
    const childBytes = new Uint8Array(await child.save());
    const childBuffer = Buffer.from(childBytes);

    const record = await documents.create({
      title: seg.title,
      mime_type: PDF_MIME,
      parse_status: 'pending',
      tags: [tag],
      content_hash: sha256Hex(childBuffer),
      ...(bundle.created_by ? { created_by: bundle.created_by } : {}),
      // A File is a named Blob; the client auto-assembles it into the multipart
      // upload the engine's `file` field expects.
      file: new File([childBytes], childFilename(seg.title), { type: PDF_MIME }),
    });
    created.push(record.id);
    await log?.(`created ${record.id} — pages ${seg.startPage}–${seg.endPage}`);

    // Await acceptance (202), not the classification itself — the work runs in
    // the background pool. A trigger failure is logged, never fatal: the child
    // is already stored and can be reclassified by hand.
    try {
      await documents.record(record.id).invoke('classify', {});
    } catch (err) {
      console.error(`[documents] classify trigger failed for ${record.id}`, err);
    }
  }

  // Retire the bundle: it's the original combined file (kept as the archival
  // copy), matches no single type, and now belongs to the group. Adopt a
  // year-stamped title only when a human hasn't renamed it.
  const bundleTags = Array.from(new Set([...(bundle.tags ?? []), tag]));
  await documents.record(docId).update({
    parse_status: 'unmatched',
    metadata: replaceMetadata(bundle.metadata, { doc_type: UNKNOWN_DOC_TYPE }),
    tags: bundleTags,
    ...(!bundle.title_edited && year ? { title: `Tax Return (${year})` } : {}),
  });

  return {
    split: true,
    tax_year: year,
    pieces: planned.length,
    created,
    tag,
    message: `Split into ${planned.length} documents${year ? ` for ${year}` : ''}`,
  };
};

export default handler;
