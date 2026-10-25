/**
 * What a chat message may carry. Shared by the composer (which stops a file
 * before it's sent) and the chat route (which enforces it — see
 * `server/chat/attachments.ts`). The models read images and PDFs, and every
 * file costs tokens on each turn it's shown.
 */

/** The most files one message may carry (also `chat-message.attachments`' `maxItems`). */
export const MAX_ATTACHMENTS = 5;

/** The largest single attachment, in bytes. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** What every model provider chat runs on can read. */
export const ATTACHMENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

/** What a composer says when it turns a file away, by the reason it gives. */
export const ATTACHMENT_ERRORS = {
  accept: 'Only photos (JPEG, PNG, WebP, GIF) and PDFs can be attached.',
  max_file_size: `Files can be at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB each.`,
  max_files: `A message can carry at most ${MAX_ATTACHMENTS} files.`,
} as const;
