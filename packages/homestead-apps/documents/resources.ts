import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { toVariants, UNKNOWN_DOC_TYPE } from './doc-types/docType';
import { BUILTIN_DOC_TYPES } from './doc-types/builtins';

export const DOCUMENTS = 'documents' as const;
export const COLLECTIONS = 'collections' as const;

/** Discriminator property for the `metadata` union. Also the derived column. */
export const DOC_TYPE_FIELD = 'doc_type' as const;

/** Parse lifecycle. `unmatched` is an expected outcome, not a failure. */
export const PARSE_STATUSES = ['pending', 'parsed', 'unmatched', 'failed'] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

/**
 * A plain array: `metadata`'s variants are compiled from the static built-in
 * doc types (`BUILTIN_DOC_TYPES`), so the whole schema is known at import time —
 * no registry, no boot step.
 */
export const documentsResources: ResourceDefinition[] = [
  {
    singular: 'collection',
    plural: COLLECTIONS,
    description:
      'A named, folder-like grouping of documents. A document can belong to ' +
      'many collections. Sharing a collection (via the permissions system) is ' +
      'what grants other people access to the documents inside it.',
    // Private to its owner until explicitly shared — which is what makes
    // "share a collection" mean something. This used to be expressed from the
    // outside, by a `PRIVATE_COLLECTIONS` list in core naming this app's
    // resources; the resource says it itself now.
    access: { model: 'private' },
    user_settable_create: true,
    fields: {
      name: { type: 'string', required: true, description: 'Display name of the collection.' },
      description: { type: 'string' },
      /** A colour token for the folder chip, e.g. a hex string. Free-form. */
      color: { type: 'string', description: 'Colour for the folder chip (e.g. a hex value).' },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'document',
    plural: DOCUMENTS,
    description:
      'An uploaded document — the file, its extracted text, and any metadata ' +
      'parsed from it when it matches a known document type.',
    // Owner-only until a grant says otherwise. A document is reached by its
    // owner, by whoever holds a record grant on it, or through the
    // collection-scope grant that sharing a folder writes.
    access: { model: 'private' },
    user_settable_create: true,
    fields: {
      // `ai.embed` makes the platform extract the file's text into the
      // synthesized companion `file_text` and embed it for semantic search on
      // upload — so the assistant can answer questions about document contents.
      file: {
        type: 'file',
        required: true,
        description: 'pdf/jpeg/png, or plain text (e.g. an ingested email body)',
        ai: { embed: true },
      },
      title: {
        type: 'string',
        description:
          'Defaults to the uploaded filename, then replaced by an AI-inferred ' +
          'title on classify — unless a human has edited it (see title_edited).',
      },
      /**
       * Set once a human renames the document by hand. Classify infers a title
       * from the document, but only writes it while this is false, so a manual
       * rename survives a later "Read again".
       */
      title_edited: {
        type: 'boolean',
        default: false,
        description: 'True once a human has edited the title; stops AI from overwriting it.',
      },
      /**
       * Free-form labels a person attaches by hand to organise and find
       * documents. Deliberately top-level rather than in `metadata`: classify
       * and a manual doc-type switch both replace the whole `metadata` object,
       * so tags kept there would be lost — here they survive both.
       */
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Free-form labels for organising and finding documents.',
      },
      /**
       * Ids of the collections this document belongs to (many-to-many). A
       * collection-scope grant on `document` filtered by `'<id>' in collections`
       * is how sharing a collection reaches its documents, so membership lives
       * here rather than on the collection. `set-null` drops the id from every
       * document when a collection is deleted, keeping membership consistent.
       */
      collections: {
        type: 'array',
        items: {
          type: 'string',
          reference: { resource: 'collection', onDelete: 'set-null' },
        },
        description: 'Ids of the collections this document belongs to.',
      },
      /**
       * Ids of the people this document is about (many-to-many). Seeded on
       * classify from the names a doc type extracts (resolved against the People
       * directory) and editable by hand; a document may have none. `set-null`
       * drops a deleted person's id from every document, keeping the link
       * consistent — mirrors `collections` above.
       */
      people: {
        type: 'array',
        items: {
          type: 'string',
          reference: { resource: 'person', onDelete: 'set-null' },
        },
        description: 'Ids of the people this document is about.',
      },
      /**
       * Recorded at upload because `:download` serves every file as
       * `application/octet-stream` — the classify handler can't recover the
       * real type from the bytes it reads back, and the model needs it.
       */
      mime_type: { type: 'string', description: 'The uploaded file’s MIME type.' },
      /**
       * SHA-256 (lowercase hex) of the uploaded file's bytes, used to detect
       * duplicate documents. Populated server-side: the email-ingest cron
       * computes it at ingest and hard-blocks an attachment whose hash already
       * exists; hand-uploads get it stamped by the file-index gateway trigger.
       */
      content_hash: {
        type: 'string',
        description: 'SHA-256 (hex) of the file bytes; used to detect duplicate uploads.',
      },
      /**
       * Legacy: text now lives in the synthesized `file_text` companion (filled
       * by the platform index pipeline). Kept only so the `full_text → file_text`
       * backfill can read old records; removed in a follow-up once migrated.
       */
      full_text: {
        type: 'string',
        description: 'Deprecated — see file_text. Retained for backfill only.',
      },
      parse_status: {
        type: 'string',
        enum: PARSE_STATUSES,
        default: 'pending',
        description: 'Where the document is in the classify/extract lifecycle.',
      },
      confidence: {
        type: 'number',
        description: "The model's confidence in the matched type, 0-1.",
      },
      /**
       * The tagged union. Its `doc_type` tag and every variant field become
       * derived columns, so both are filterable:
       *   metadata.doc_type == 'form-1099-int' && metadata.box_1_interest > 500
       */
      metadata: {
        type: 'object',
        discriminator: DOC_TYPE_FIELD,
        variants: toVariants(BUILTIN_DOC_TYPES),
        description:
          'Fields parsed from the document, shaped by its matched type. ' +
          `Tagged "${UNKNOWN_DOC_TYPE}" when it matches none.`,
      },
      /**
       * Set by a doc type's `post_classify` hook to the resource it created
       * from this document (e.g. `hsa-receipts/{id}`). Also the idempotency
       * guard: a re-classify skips the hook when this is already set.
       */
      linked_resource: {
        type: 'string',
        description:
          'Path of the resource created from this document by a post-classify hook.',
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
      /**
       * Set when the document was ingested from an email by the
       * `documents-ingest-email` cron (empty for hand-uploaded documents). The
       * source message's provider id — used to look up which attachments of a
       * message have already been filed, so a re-run doesn't duplicate them.
       */
      source_email_id: {
        type: 'string',
        description: 'Provider message id this document was ingested from (email source only).',
      },
      /**
       * Stable per-message part key: `"{index}:{filename}"` for an attachment
       * (the index disambiguates repeated filenames or unnamed parts within one
       * message, so dedup is exact even when two attachments share a name), or
       * the reserved `"body"` when the document is the message body itself.
       */
      source_email_attachment: {
        type: 'string',
        description:
          'Identifier of the source email part ("{index}:{filename}" for an ' +
          'attachment, "body" for the message body).',
      },
    },
    // POST /api/aep/documents/{id}:classify — reads the stored file, so it
    // takes the record's id rather than re-uploading the bytes.
    customMethods: {
      classify: {
        target: 'item',
        async: true,
        title: 'Classify document',
        load: () => import('./methods/classify'),
      },
      // POST /api/aep/documents/{id}:split — reads the stored PDF, splits a
      // bundle (e.g. a tax return) into one document per constituent form, and
      // classifies each. A separate method from classify on purpose: a normal
      // single-document upload never runs it.
      split: {
        target: 'item',
        async: true,
        title: 'Split bundle into documents',
        load: () => import('./methods/split'),
      },
      // POST /api/aep/documents/{id}:link — runs the doc type's post_classify
      // hook for a type or fields a person set by hand (classify runs it
      // itself). No-op when the document already has a linked_resource.
      link: {
        target: 'item',
        title: 'Create the linked record',
        load: () => import('./methods/link'),
      },
      // Migration support for the full_text → file_text backfill; called by
      // scripts/backfill-document-embeddings.sh. Removable post-migration.
      reembed: {
        target: 'item',
        load: () => import('./methods/reembed'),
      },
    },
  },
];
