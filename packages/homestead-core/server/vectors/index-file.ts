/**
 * The generic "index a file field" pipeline — the platform-level equivalent of
 * the documents app's `classify`, but for any resource's `ai`-enabled file
 * field. Triggered behind the scenes by the `/api/aep` gateway on upload (see
 * `homestead-server/src/routes/aep-gateway.ts`), it:
 *
 *   1. downloads the stored file (over loopback, as the caller),
 *   2. extracts its full text (a vision model for PDFs/images; a plain decode
 *      for text files) into the companion `<field>_text` field,
 *   3. if the field embeds, chunks the text, embeds each chunk, and replaces the
 *      field's vectors in the store.
 *
 * The (record, field) pair is the unit of work: one call indexes exactly one
 * file field of one record.
 */

import { z } from 'zod';
import { HomesteadError } from '@rambleraptor/homestead-client';
import { serverClient } from '../client';
import { getEmbeddingModelId, isAiConfigured } from '../ai/config';
import { aiEmbed, aiGenerateObject, type ModelMessage } from '../ai/generate';
import { companionTextField } from '../../resources/ai-fields';
import { sniffMediaType } from '../../resources/media-type';
import type { EmbedOptions } from '../../resources/types';
import { chunkText } from './chunk';
import { getVectorStore } from './store';
import type { FieldScope, VectorChunk } from './types';

/**
 * Chunk, embed, and store `text` for one (record, field), replacing any existing
 * vectors. Empty text purges the field's vectors instead. Returns the number of
 * chunks stored. Shared by {@link indexFile} (on upload) and the documents
 * backfill (re-embedding already-extracted text without a fresh vision call).
 */
export async function embedTextIntoStore(
  scope: FieldScope,
  text: string,
  embed: Required<EmbedOptions>,
): Promise<number> {
  const store = getVectorStore();
  if (!store) return 0;
  if (!text) {
    await store.purge(scope);
    return 0;
  }
  const override = embed.embedding_model || undefined;
  const pieces = chunkText(text, embed);
  const vectors = await aiEmbed(pieces, { model: override });
  // Tag the vectors with the exact model that produced them (resolving the
  // per-field override the same way `aiEmbed` did), so search never compares
  // them against another model's and a model swap is a clean re-embed.
  const model = getEmbeddingModelId(override);
  const chunks: VectorChunk[] = pieces.map((piece, i) => ({
    chunk: i,
    text: piece,
    vector: vectors[i],
  }));
  await store.replace({ ...scope, model }, chunks);
  return chunks.length;
}

/** Heuristic: are these bytes plausibly UTF-8 text (no NULs, mostly printable)? */
function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  if (n === 0) return false;
  let control = 0;
  for (let i = 0; i < n; i++) {
    const c = bytes[i];
    if (c === 0) return false; // NUL → binary
    // Allow tab/newline/carriage-return; count other C0 controls.
    if (c < 0x09 || (c > 0x0d && c < 0x20)) control++;
  }
  return control / n < 0.1;
}

const EXTRACT_PROMPT =
  "Transcribe this document's full text verbatim into \"text\". Include every " +
  'page in reading order. Preserve line breaks and labels; do not summarize, ' +
  'correct, translate, or reorder anything. If the document has no readable ' +
  'text, return an empty string.';

/** Pull the file's full text: vision model for pdf/image, decode for text. */
async function extractText(bytes: Uint8Array): Promise<string> {
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) {
    if (looksLikeText(bytes)) return new TextDecoder().decode(bytes).trim();
    // Unknown binary we can't read — nothing to index.
    return '';
  }
  // Recognized, but not something every vision model accepts.
  if (mediaType === 'image/heic' || mediaType === 'image/heif') return '';
  if (!isAiConfigured()) {
    throw new Error('AI is not configured — cannot extract text from this file');
  }
  const base64 = Buffer.from(bytes).toString('base64');
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: EXTRACT_PROMPT },
        { type: 'file', data: base64, mediaType },
      ],
    },
  ];
  const { text } = await aiGenerateObject({
    messages,
    schema: z.object({ text: z.string().describe('The full text, verbatim.') }),
  });
  return text.trim();
}

export interface IndexFileInput {
  /** Resource singular, e.g. `document`. */
  resource: string;
  /** Resource plural, for the loopback aep calls, e.g. `documents`. */
  plural: string;
  /** Record id. */
  record: string;
  /** File field name, e.g. `file`. */
  field: string;
  /** Resolved embed options, or null when the field only extracts text. */
  embed: Required<EmbedOptions> | null;
  /** Caller's bearer token — the pipeline acts as the uploader. */
  token: string;
}

export interface IndexFileResult {
  field: string;
  /** Characters of text extracted. */
  chars: number;
  /** Chunks embedded and stored (0 when the field doesn't embed). */
  chunks: number;
}

/**
 * Run the extract → store-text → (chunk → embed → index) pipeline for one file
 * field. Throws on hard failures (download, extraction, embedding); the caller
 * (the gateway trigger) records that on the operation.
 */
export async function indexFile(input: IndexFileInput): Promise<IndexFileResult> {
  const { resource, plural, record, field, embed, token } = input;

  const ref = serverClient(token).collection(plural).record(record);

  let bytes: Uint8Array;
  try {
    const blob = await ref.download(field);
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch (err) {
    const detail = err instanceof HomesteadError ? err.code : err;
    throw new Error(`could not read ${plural}/${record} field "${field}": ${detail}`);
  }

  const text = await extractText(bytes);

  // Store the extracted text on the companion field regardless of embedding, so
  // it's displayable and the chat model can read the whole document.
  await ref.update({ [companionTextField(field)]: text });

  if (!embed) {
    return { field, chars: text.length, chunks: 0 };
  }
  // Embeds the text (or purges vectors when empty); no-ops if the store is
  // unwired (embedding provider unconfigured). Text is already stored above.
  const chunks = await embedTextIntoStore({ resource, record, field }, text, embed);
  return { field, chars: text.length, chunks };
}
