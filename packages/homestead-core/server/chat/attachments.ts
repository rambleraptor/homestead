/**
 * Files a person attaches to a chat message: what the chat route accepts (the
 * limits are in `chat/attachment-limits`, shared with the composer), and how
 * they reach the model.
 *
 * They are stored on the message itself (`chat-message.attachments`, a list of
 * files — see docs/design/nested-files.md), so they share the message's
 * access, go when it goes, and read back as descriptors. The engine stores any
 * file; the limits below are chat's own: the models read images and PDFs, and
 * every file costs tokens on every turn it's shown.
 *
 * The model only ever sees bytes the server read from storage itself, inlined
 * as `data:` URLs. A URL in a part would be fetched by the AI SDK from the
 * server, so stored history never contributes file parts of its own (see
 * `toUiMessages`).
 */

import type { UIMessage } from 'ai';
import type { FileDescriptor } from '@rambleraptor/homestead-client';
import { resolveMediaType } from '../../resources/media-type';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '../../chat/attachment-limits';

export { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS };

/**
 * The largest request the chat route reads: every attachment at its limit,
 * plus room for the message itself.
 */
export const MAX_TURN_REQUEST_BYTES = MAX_ATTACHMENTS * MAX_ATTACHMENT_BYTES + 1024 * 1024;

/**
 * How many of the latest messages with attachments show the model their files.
 * Older attachments become a one-line note, so a long thread doesn't resend
 * every photo on every turn.
 */
export const ATTACHMENT_TURNS = 3;

export type AttachmentCheck =
  | { ok: true; files: File[] }
  | { ok: false; status: number; message: string };

/**
 * Check a message's uploads against chat's limits. Each file's type comes from
 * its bytes (`resolveMediaType`), not from what the upload claims, and the
 * returned files carry that type.
 */
export async function checkAttachments(uploads: File[]): Promise<AttachmentCheck> {
  if (uploads.length > MAX_ATTACHMENTS) {
    return { ok: false, status: 400, message: `attach at most ${MAX_ATTACHMENTS} files to a message` };
  }
  const files: File[] = [];
  for (const upload of uploads) {
    const name = upload.name || 'file';
    if (upload.size > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        status: 413,
        message: `"${name}" is ${Math.ceil(upload.size / 1024 / 1024)} MB; the limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`,
      };
    }
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const mediaType = resolveMediaType(bytes, upload.type);
    if (!ATTACHMENT_TYPES.includes(mediaType)) {
      return {
        ok: false,
        status: 415,
        message: `"${name}" isn't an image (JPEG, PNG, WebP, GIF) or a PDF`,
      };
    }
    files.push(new File([bytes], name, { type: mediaType }));
  }
  return { ok: true, files };
}

/** A conversation title for a message that is only attachments. */
export function attachmentsTitle(files: readonly File[]): string {
  return files.map((f) => f.name).join(', ');
}

/** A stored message as far as attachments are concerned. */
export interface WithAttachments {
  id: string;
  role: 'user' | 'assistant';
  attachments?: FileDescriptor[];
}

/**
 * Add each message's attachments to the model's view of the history: the files
 * themselves for the latest {@link ATTACHMENT_TURNS} messages that have any, a
 * note for older ones. `read` fetches one file's bytes; a file that can't be
 * read becomes a note rather than failing the turn.
 */
export async function withAttachments(
  ui: UIMessage[],
  stored: readonly WithAttachments[],
  read: (messageId: string, file: FileDescriptor) => Promise<Uint8Array>,
): Promise<UIMessage[]> {
  const byId = new Map(stored.map((m) => [m.id, m]));
  const shown = new Set(
    stored
      .filter((m) => m.role === 'user' && (m.attachments?.length ?? 0) > 0)
      .slice(-ATTACHMENT_TURNS)
      .map((m) => m.id),
  );

  return Promise.all(
    ui.map(async (message) => {
      const files = byId.get(message.id)?.attachments ?? [];
      if (message.role !== 'user' || files.length === 0) return message;
      const parts: UIMessage['parts'] = [];
      const labels: string[] = [];
      const notes: string[] = [];
      const unreadable: string[] = [];
      for (const file of files) {
        if (!shown.has(message.id)) {
          notes.push(attachmentLabel(file));
          continue;
        }
        try {
          const bytes = await read(message.id, file);
          parts.push({
            type: 'file',
            mediaType: file.media_type,
            filename: file.name,
            url: `data:${file.media_type};base64,${Buffer.from(bytes).toString('base64')}`,
          });
          labels.push(attachmentLabel(file));
        } catch {
          unreadable.push(attachmentLabel(file));
        }
      }
      // Every file is named with its id, shown or not, so the model can file
      // it into a record (see `attachmentSource`).
      if (labels.length > 0) {
        parts.push({ type: 'text', text: `[Attached: ${labels.join('; ')}]` });
      }
      if (notes.length > 0) {
        parts.push({ type: 'text', text: `[Attached earlier, no longer shown: ${notes.join('; ')}]` });
      }
      if (unreadable.length > 0) {
        parts.push({ type: 'text', text: `[Attached, but couldn't be read: ${unreadable.join('; ')}]` });
      }
      return { ...message, parts: [...message.parts, ...parts] };
    }),
  );
}

/** How the model sees a file: its name, type and the id a file field takes. */
function attachmentLabel(file: FileDescriptor): string {
  return `${file.name} (${file.media_type}, attachment id: ${file.id})`;
}

/**
 * The files of one conversation, by attachment id, for the chat tools to put
 * in a file field (`AttachmentSource` in `./execute`). Only ids from
 * `stored` — this conversation's messages — resolve; anything else is refused,
 * so a model can't be talked into filing a file from somewhere else.
 */
export function attachmentSource(
  stored: readonly WithAttachments[],
  read: (messageId: string, file: FileDescriptor) => Promise<Uint8Array>,
): (id: string) => Promise<File> {
  const byFileId = new Map<string, { messageId: string; file: FileDescriptor }>();
  for (const message of stored) {
    for (const file of message.attachments ?? []) byFileId.set(file.id, { messageId: message.id, file });
  }
  return async (id) => {
    const found = byFileId.get(id);
    if (!found) throw new Error(`no attachment "${id}" in this conversation`);
    const bytes = await read(found.messageId, found.file);
    return new File([new Uint8Array(bytes)], found.file.name, { type: found.file.media_type });
  };
}
