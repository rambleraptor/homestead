/**
 * `documents/{id}:classify` async custom method (AEP-136 + AEP-151).
 *
 * Reads the *stored* file rather than taking bytes in the body: the method is
 * item-scoped, so it has the record id and can pull the file back over loopback
 * with the caller's token (no need for the caller to base64 the bytes into the
 * request, as a collection-scoped method with no record yet would have to).
 *
 * Long-running: one vision call over a whole document is slow, so the call
 * returns 202 with an Operation and the work runs in the background. The
 * handler PATCHes the record itself — the operation records progress and
 * failure, it isn't the delivery mechanism.
 *
 * Preconditions live in `validate`, which runs before an Operation exists, so a
 * bad call gets a plain 4xx/503 rather than a 202 followed by a failed op.
 *
 * The body is normally empty — the method picks the type itself. A caller may
 * pass `{ "doc_type": "<id>" }` to *force* that type: pass 1 is skipped and only
 * the extraction pass runs, so a human's authoritative choice still gets its
 * fields AI-filled. See `./forced-type`.
 */

import { z } from 'zod';
import type {
  AsyncCustomMethodHandler,
  AsyncCustomMethodValidator,
} from '@rambleraptor/homestead-core/resources/types';
import { isAiConfigured } from '@rambleraptor/homestead-core/server/ai/config';
import {
  aiGenerateObject,
  type ModelMessage,
} from '@rambleraptor/homestead-core/server/ai/generate';
import { HomesteadError } from '@rambleraptor/homestead-client';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { DOCUMENTS } from '../resources';
import {
  docTypeIds,
  freeTitlePlaceholders,
  readFacts,
  renderTitleTemplate,
  replaceMetadata,
  toExtractionSchema,
  toUnknownExtractionSchema,
  UNKNOWN_DOC_TYPE,
  type DocType,
} from '../doc-types/docType';
import { getDocType, getDocTypes } from '../doc-types/registry';
import { parseForcedDocType } from './forced-type';
import { resolveDocumentPersonIds } from '../personLinks';
import { PEOPLE } from '../../people/resources';
import type { Person } from '../../people/types';
import type { Document } from '../types';

/**
 * Below this, a match is downgraded to `unmatched`: a wrong parse presented as
 * fact is worse than an honest "we couldn't tell", because the metadata looks
 * authoritative in the UI.
 */
const MIN_CONFIDENCE = 0.5;

/**
 * Room for the answer. Generous on purpose — a cap is a ceiling, not a spend
 * (the model stops when it's done), so over-provisioning costs nothing while a
 * truncated extraction loses fields. Shared by both passes; classification's
 * answer is tiny and never approaches it.
 */
const MAX_OUTPUT_TOKENS = 16384;

/**
 * What the model may be handed. Gemini reads PDFs natively, multi-page.
 * `text/plain` covers email bodies filed by the ingest cron (and hand-uploaded
 * .txt files) — sent to the model as prompt text, not a file part.
 */
const SUPPORTED_MIME = /^(application\/pdf|image\/(jpeg|png|webp|gif)|text\/plain)$/;

function classifyPrompt(types: DocType[]): string {
  const catalogue = types
    .map((t) => `- ${t.id}: ${t.label} — ${t.description}`)
    .join('\n');

  return `You are reading a scanned or digital household document. Do two things.

1. Write a short, human-readable "title" for the document — what a person would
   name this file so they could find it later.

   Follow one shape: "<Document> — <Subject>". Name the kind of document, then an
   em dash surrounded by spaces (" — "), then the specific person, business,
   issuer, or item it concerns. When the document is tied to a single year (a tax
   form, an annual statement), put that year in parentheses right after the
   document name: "<Document> (<Year>) — <Subject>".

   Match these examples in form and tone:
   - 1099-INT (2024) — Pecan Street Credit Union
   - 1098 (2024) — Lone Star Mortgage
   - Donation Statement (2024) — Central Texas Food Bank
   - Auto Insurance — 2019 Honda Civic
   - Business Owner's Policy — Rivera Design Co
   - Certificate of Marriage — Dana & Sam Rivera
   - Driver's License — Mateo Rivera
   - Apple — Studio Display
   - B&H Photo — 50mm Lens

   Rules:
   - Left of the dash is what the document *is*: the form number, certificate
     name, or policy type — or, for a receipt or invoice, the vendor. Right of the
     dash is who or what it concerns: the issuer, the named person, the insured
     asset, or the purchased item.
   - Use the document's own specifics. Never fall back on generic words like
     "Scan", "Document", "Statement", or "Untitled" on their own.
   - Title Case throughout. No file extension, no surrounding quotes, no trailing
     period. Keep it under about eight words.
   - Drop the dash and the second half only when the document truly has no
     distinct subject.

2. Decide whether it is one of these known document types:

${catalogue || '(no known document types are configured)'}

   Set "doc_type" to the matching id. If it is not clearly one of them, set
   "doc_type" to "${UNKNOWN_DOC_TYPE}". Many documents legitimately match
   nothing — "${UNKNOWN_DOC_TYPE}" is a normal answer, not a failure, and is far
   better than forcing a wrong match.

Also set "confidence" between 0 and 1: how sure you are of the type match. Use a
low value when the document is blurry, cropped, or only loosely resembles a known
type.`;
}

/**
 * The extraction pass runs only after {@link classifyPrompt} has matched a
 * single type, so it names that type and asks for its fields alone — a small,
 * focused schema (see `toExtractionSchema`) rather than every type's fields at
 * once. The field-level guidance rides on each field's schema `describe`; these
 * are the rules that apply across all of them.
 */
function extractPrompt(type: DocType): string {
  return `This document has been identified as: ${type.label} — ${type.description}

Read the document and fill in that type's fields. Rules:
- Copy values exactly as printed. Do not reformat, round, or unmask them.
- Set any field you cannot find to null. Never guess, and never carry a value
  over from a different field just because it looks similar.
- Numbers must have no currency symbols, thousands separators, or percent signs.`;
}

/**
 * The extraction pass for a document that matched no type. With no fields to
 * ask for, it asks for the facts worth finding later — what's printed on a
 * rating plate, a paint can, a ticket — so the document still reads as fields.
 */
function factsPrompt(): string {
  return `This document matched none of the known document types. List the facts a
person would want to look up later, as label/value pairs, most useful first:
- identifiers: model, serial, part, account, policy, membership, confirmation,
  or reference numbers, and codes such as a paint color code;
- names: the brand or manufacturer, the business or issuer, who it is for;
- dates: purchase, issue, expiry, event, or service due dates;
- amounts, quantities, sizes, capacities, and ratings;
- contact details: phone numbers, websites, addresses.

Rules:
- Copy each value exactly as printed. Never guess or infer a value.
- Skip boilerplate, marketing copy, and legal text.
- At most 15 facts. An empty list is a fine answer.`;
}

/** Clamp to 0-1: the field is advisory, and a wild value shouldn't poison it. */
function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Drop the fields the model returned as null (its "couldn't find it" signal
 * under the nullable schema), leaving only the values actually read off the
 * document. The caller re-attaches the `doc_type` discriminator afterwards.
 */
function stripNulls(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null),
  );
}

export const validate: AsyncCustomMethodValidator = async ({ id, auth, request }) => {
  if (!isAiConfigured()) {
    return Response.json(
      { error: 'Service unavailable', message: 'AI is not configured on the server' },
      { status: 503 },
    );
  }
  if (!id) {
    return Response.json(
      { error: 'Bad request', message: 'classify is addressed on a single document' },
      { status: 400 },
    );
  }

  // A forced `doc_type` that names no known type is a 400 here, before any
  // operation exists — never a 202 followed by a handler that can't proceed.
  const forced = await parseForcedDocType(request);
  if (forced.kind === 'invalid') {
    return Response.json(
      { error: 'Bad request', message: forced.message },
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
  if (doc.mime_type && !SUPPORTED_MIME.test(doc.mime_type)) {
    return Response.json(
      {
        error: 'Bad request',
        message: `unsupported file type "${doc.mime_type}" — expected a PDF, an image, or plain text`,
      },
      { status: 400 },
    );
  }
};

const handler: AsyncCustomMethodHandler = async ({ id, auth, request }) => {
  const docId = id!;
  const types = getDocTypes();

  // A forced type (validated to a known id already) pins the classification and
  // skips pass 1; an absent/invalid override falls through to normal pass-1.
  const forced = await parseForcedDocType(request);
  const forcedDocType = forced.kind === 'forced' ? forced.docType : null;
  const documents = serverClient(auth.token).collection<Document>(DOCUMENTS);
  const doc = await documents.get(docId);

  // The stored bytes, pulled back over loopback as the caller.
  let bytes: Buffer;
  try {
    const blob = await documents.record(docId).download('file');
    bytes = Buffer.from(await blob.arrayBuffer());
  } catch (err) {
    const detail = err instanceof HomesteadError ? err.code : err;
    throw new Error(`could not read the document's file: ${detail}`);
  }
  const base64 = bytes.toString('base64');
  // Sent as-is: Gemini reads application/pdf directly, so there's no
  // client-side rasterisation and no first-page-only limit.
  const mediaType = doc.mime_type || 'application/pdf';

  // A plain-text document (an email body filed by the ingest cron, a .txt
  // upload) is inlined into the message as text — every provider reads that,
  // and there are no pages to rasterise. Binary documents ride as a file part.
  const documentPart = mediaType.startsWith('text/')
    ? ({ type: 'text', text: bytes.toString('utf-8') } as const)
    : ({ type: 'file', data: base64, mediaType } as const);

  // Pair an instruction with the document as one user message. Each pass builds
  // its own — the document is re-sent so the extraction pass sees the pages too,
  // not just the classification's verdict.
  const withDocument = (text: string): ModelMessage[] => [
    {
      role: 'user',
      content: [{ type: 'text', text }, documentPart],
    },
  ];

  // Shared failure path: pin it to the concrete input, mark the document failed
  // (the list view reads parse_status; the operation carries the detail), and
  // rethrow. `aiGenerateObject` already logs the provider's raw response; the
  // `pass` says which call it belongs to.
  const failClassify = async (err: unknown, pass: string): Promise<never> => {
    console.error(
      `[documents] classify ${pass} failed for ${docId} ` +
        `(mime=${doc.mime_type ?? 'unknown'}, bytes=${bytes.length}, doc_types=${types.length})`,
    );
    await documents.record(docId).update({ parse_status: 'failed' });
    throw err;
  };

  // Pass 1 — classification. Skipped entirely when the caller forced a type:
  // the human's choice is authoritative, so confidence is full and we go
  // straight to extraction (pass 2). Otherwise a deliberately tiny schema — a
  // title, a confidence, and the type id as an enum — carries none of the
  // types' fields, so it stays small however many types are configured (the
  // whole point of the split; see docTypeIds/toExtractionSchema).
  let matchedDocType: string;
  let confidence: number;
  // The model-authored title, only when pass 1 ran; a forced call has none and
  // relies on the matched type's title_template (or leaves the title as-is).
  let modelTitle: string | undefined;

  if (forcedDocType) {
    matchedDocType = forcedDocType;
    confidence = 1;
  } else {
    const classifySchema = z.object({
      title: z.string().describe('A short, human-readable title for the document.'),
      confidence: z.number().describe('Confidence in the type match, 0 to 1.'),
      doc_type: z
        .enum(docTypeIds(types))
        .describe(`The matching document type id, or "${UNKNOWN_DOC_TYPE}" if none.`),
    });

    let classified: z.infer<typeof classifySchema>;
    try {
      classified = await aiGenerateObject({
        messages: withDocument(classifyPrompt(types)),
        schema: classifySchema,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
    } catch (err) {
      return failClassify(err, 'classification');
    }

    confidence = clampConfidence(classified.confidence);
    matchedDocType =
      classified.doc_type !== UNKNOWN_DOC_TYPE && confidence >= MIN_CONFIDENCE
        ? classified.doc_type
        : UNKNOWN_DOC_TYPE;
    modelTitle = classified.title;
  }

  const matched = matchedDocType !== UNKNOWN_DOC_TYPE;

  // Pass 2 — extraction. When a type matched, the schema is that single
  // type's fields (small, and focused on the fields this document has), and the
  // document is re-sent so the model reads it, not the pass-1 verdict. The model
  // fills every field, using null for the ones it couldn't find (the fields are
  // `.nullable()`, not `.optional()`, to keep Gemini from aborting — see
  // toExtractionSchema). Drop the nulls so the stored record carries only real
  // values, and re-attach the discriminator. Unmatched documents (including a
  // low-confidence guess, downgraded rather than stored as a match) get a
  // free-form facts pass instead (see factsPrompt). (The document's text is
  // extracted separately by the platform index pipeline into `file_text`,
  // independent of this classification.)
  let metadata: { doc_type: string; [field: string]: unknown } = {
    doc_type: UNKNOWN_DOC_TYPE,
  };
  // A title rendered from the matched type's template — set only when the type
  // has one and every placeholder filled. Null leaves the model-authored title
  // in place (see the title selection below).
  let templateTitle: string | null = null;
  if (matched) {
    const matchedType = getDocType(matchedDocType)!;

    // Free placeholders — a template name that isn't a field, e.g. `{tax_year}`
    // on a form with no tax-year column — ride along as extra nullable strings on
    // the extraction schema so the model reads them off the document in the same
    // pass (no extra vision call). They're split back out below and never stored.
    const freePlaceholders = freeTitlePlaceholders(matchedType);
    const extractionSchema = freePlaceholders.length
      ? toExtractionSchema(matchedType).extend(
          Object.fromEntries(
            freePlaceholders.map((name) => [
              name,
              z
                .string()
                .nullable()
                .describe(
                  `The value for the "{${name}}" placeholder in this document's ` +
                    'title. Read it off the document exactly as printed; null if ' +
                    'it is not shown.',
                ),
            ]),
          ),
        )
      : toExtractionSchema(matchedType);

    let extracted: Record<string, unknown>;
    try {
      extracted = await aiGenerateObject({
        messages: withDocument(extractPrompt(matchedType)),
        schema: extractionSchema,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
    } catch (err) {
      return failClassify(err, 'extraction');
    }

    // Split the model's answer into the type's real fields (stored) and the
    // free-placeholder values (title-only). Both render the template; only the
    // fields — nulls dropped — become the stored metadata.
    const fieldValues: Record<string, unknown> = { ...extracted };
    const freeValues: Record<string, unknown> = {};
    for (const name of freePlaceholders) {
      freeValues[name] = fieldValues[name];
      delete fieldValues[name];
    }
    metadata = { ...stripNulls(fieldValues), doc_type: matchedDocType };

    if (matchedType.title_template) {
      templateTitle = renderTitleTemplate(matchedType.title_template, {
        ...fieldValues,
        ...freeValues,
      });
    }
  } else {
    // Unmatched: read free-form facts instead of a type's fields. Best-effort —
    // the classification itself succeeded, so a failed read files the document
    // unmatched without facts rather than failing it.
    try {
      const extracted = await aiGenerateObject({
        messages: withDocument(factsPrompt()),
        schema: toUnknownExtractionSchema(),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      const facts = readFacts(extracted.facts);
      if (facts.length) metadata = { doc_type: UNKNOWN_DOC_TYPE, facts };
    } catch (err) {
      console.error(`[documents] reading facts failed for ${docId}`, err);
    }
  }

  // Prefer the type's rendered template; fall back to the model-authored title —
  // the only title for an unmatched document, a templateless type, or a template
  // left with an unfilled placeholder. Only adopt a title when a human hasn't
  // renamed the document, and never let a blank one clobber the existing
  // (filename) default.
  const inferredTitle = templateTitle ?? modelTitle?.trim();
  const setTitle = !doc.title_edited && inferredTitle ? { title: inferredTitle } : {};

  const updated = await documents.record(docId).update({
    ...setTitle,
    confidence,
    metadata: replaceMetadata(doc.metadata, metadata),
    parse_status: matched ? 'parsed' : 'unmatched',
  });

  // Seed the document's people link from the names this type extracted — but
  // only when it has none yet, so a re-classify ("Read again") never clobbers a
  // link a human has since curated. Resolves each extracted name against the
  // People directory (the same matching the documents person facet uses).
  // Best-effort: a directory read or link write that fails is logged, never
  // fatal to the classification, which has already succeeded.
  if (matched && !(doc.people && doc.people.length > 0)) {
    try {
      const rows = await serverClient(auth.token)
        .collection<{ id: string; name: string; aliases?: string[] }>(PEOPLE)
        .listAll();
      const directory = rows.map(
        (row): Person => ({
          id: row.id,
          name: row.name,
          aliases: row.aliases ?? [],
          households: [],
          parents: [],
          children: [],
          siblings: [],
          created_by: '',
          created: '',
          updated: '',
        }),
      );
      const peopleIds = resolveDocumentPersonIds(updated, directory);
      if (peopleIds.length > 0) {
        await documents.record(docId).update({ people: peopleIds });
      }
    } catch (err) {
      console.error(`[documents] seeding people failed for ${docId}`, err);
    }
  }

  // Fire the matched type's post-classify hook, if any. Guarded on `matched`
  // and on the document not already carrying a link, so a re-run ("Read again")
  // doesn't create a second downstream resource. A hook failure is logged but
  // never fails the classification — the parse itself already succeeded.
  if (matched && !doc.linked_resource) {
    const docType = getDocType(metadata.doc_type);
    if (docType?.post_classify) {
      try {
        const { default: hook } = await docType.post_classify();
        const result = await hook({ document: updated, metadata, auth });
        if (result?.linked_resource) {
          await documents.record(docId).update({ linked_resource: result.linked_resource });
        }
      } catch (err) {
        console.error(
          `[documents] post_classify failed for ${docId} (${metadata.doc_type})`,
          err,
        );
      }
    }
  }

  return {
    doc_type: metadata.doc_type,
    confidence,
    parse_status: matched ? 'parsed' : 'unmatched',
    message: matched
      ? `Matched ${metadata.doc_type}`
      : 'No known document type matched',
  };
};

export default handler;
