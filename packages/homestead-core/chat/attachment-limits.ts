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
