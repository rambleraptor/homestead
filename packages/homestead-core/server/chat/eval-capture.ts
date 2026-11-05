/**
 * Filing a rated reply as an eval case (`chat-messages/{id}:rate`): the
 * conversation up to and including that reply, copied into a form a replay can
 * use, with what the household keeps encrypted masked out.
 *
 * Pure: the method handler (`core/chat/methods/rate.ts`) loads the messages and
 * writes the case; this decides what goes in it.
 */

import type { ResourceDefinition } from '../../resources/types';
import type { StoredChatMessage } from '../../chat/types';

/** What stands in for a masked value. */
export const MASKED = '[masked]';

/** A value this short is left alone in free text: masking "12" everywhere would wreck the transcript. */
export const MIN_MASKED_TEXT_CHARS = 4;

/** One message of a case's transcript. Attachments are described, not copied. */
export interface TranscriptEntry {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content?: string;
  parts?: unknown[];
  status?: string;
  error?: string;
  usage?: unknown;
  attachments?: Array<{ name?: string; media_type?: string; size?: number }>;
}

/**
 * Field names that hold encrypted values: `encrypted` fields come back from a
 * read as plaintext, so a tool output can carry them. (`secret` fields read as
 * descriptors and never hold the value, so they need nothing.)
 */
export function encryptedFieldNames(defs: readonly ResourceDefinition[]): Set<string> {
  const names = new Set<string>();
  for (const def of defs) {
    for (const [name, field] of Object.entries(def.fields ?? {})) {
      if (field.encrypted && !field.secret) names.add(name);
    }
  }
  return names;
}

/** The messages a case covers: everything up to and including the rated reply, in order. */
export function messagesUpTo(
  messages: readonly StoredChatMessage[],
  ratedId: string,
): StoredChatMessage[] | null {
  const sorted = [...messages].sort((a, b) => a.seq - b.seq);
  const at = sorted.findIndex((m) => m.id === ratedId);
  return at === -1 ? null : sorted.slice(0, at + 1);
}

/** Every string inside a value, for masking those strings wherever else they appear. */
function collectStrings(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (value.length >= MIN_MASKED_TEXT_CHARS) into.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, into);
  }
}

/**
 * A copy of `value` with every property named in `names` masked, noting the
 * values it masked. Matched by name wherever it sits, since a tool output
 * doesn't say which resource a nested record is: over-masking a same-named
 * field elsewhere is the safe direction.
 */
function maskFields(value: unknown, names: ReadonlySet<string>, seen: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => maskFields(item, names, seen));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (names.has(key) && item !== null && item !== undefined && item !== '') {
      collectStrings(item, seen);
      out[key] = MASKED;
    } else {
      out[key] = maskFields(item, names, seen);
    }
  }
  return out;
}

/** A copy of `value` with each of `secrets` replaced inside every string. */
function maskText(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') {
    let text = value;
    for (const secret of secrets) text = text.split(secret).join(MASKED);
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => maskText(item, secrets));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskText(v, secrets)]));
}

/** Whether a stored tool output was shortened (`capOutput` in `./turns`). */
function hasTruncatedOutput(parts: readonly unknown[] | undefined): boolean {
  return (parts ?? []).some((part) => {
    const output = (part as { output?: unknown } | null)?.output;
    return !!output && typeof output === 'object' && (output as { truncated?: unknown }).truncated === true;
  });
}

/**
 * The transcript a case keeps. Encrypted fields are masked where they appear
 * as fields (tool inputs and outputs), and the values they held are masked
 * wherever else they turn up — a reply that repeats a card number, a later
 * message that quotes it.
 */
export function buildTranscript(
  messages: readonly StoredChatMessage[],
  encrypted: ReadonlySet<string>,
): { transcript: TranscriptEntry[]; truncated: boolean } {
  const seen = new Set<string>();
  const entries: TranscriptEntry[] = messages.map((m) => ({
    id: m.id,
    seq: m.seq,
    role: m.role,
    ...(m.content !== undefined ? { content: m.content } : {}),
    ...(m.parts ? { parts: maskFields(m.parts, encrypted, seen) as unknown[] } : {}),
    ...(m.status ? { status: m.status } : {}),
    ...(m.error ? { error: m.error } : {}),
    ...(m.usage !== undefined ? { usage: m.usage } : {}),
    ...(m.attachments?.length
      ? {
          attachments: m.attachments.map((a) => ({
            name: a.name,
            media_type: a.media_type,
            size: a.size,
          })),
        }
      : {}),
  }));
  // Longest first, so a value containing another is masked whole.
  const secrets = [...seen].sort((a, b) => b.length - a.length);
  const transcript = secrets.length > 0 ? (maskText(entries, secrets) as TranscriptEntry[]) : entries;
  const truncated = messages.some((m) => hasTruncatedOutput(m.parts));
  return { transcript, truncated };
}
