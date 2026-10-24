import type { FileUIPart } from 'ai';
import type { FileDescriptor } from '@rambleraptor/homestead-client';
import { useFileUrl } from '@rambleraptor/homestead-core/api/resourceHooks';
import {
  Attachment,
  AttachmentPreview,
  Attachments,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/attachments';
import { CHAT_MESSAGES, CONVERSATIONS } from '../resources';

/** One stored attachment: fetched and shown, opening full size in a new tab. */
function StoredAttachment({
  conversationId,
  messageId,
  file,
}: {
  conversationId: string;
  messageId: string;
  file: FileDescriptor;
}) {
  const url = useFileUrl(CHAT_MESSAGES, messageId, file, { parent: [CONVERSATIONS, conversationId] });
  const data: FileUIPart & { id: string } = {
    id: file.id,
    type: 'file',
    mediaType: file.media_type,
    filename: file.name,
    url: url ?? '',
  };
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={file.name}
      aria-label={`Open ${file.name}`}
      data-testid="chat-attachment"
    >
      <Attachment data={data}>
        <AttachmentPreview />
      </Attachment>
    </a>
  );
}

export interface MessageAttachmentsProps {
  conversationId: string | null;
  messageId: string;
  /** The stored files, once the message is saved. */
  stored?: FileDescriptor[];
  /** The files as sent, until it is. */
  local: FileUIPart[];
}

/** The files a person attached to a message. */
export function MessageAttachments({ conversationId, messageId, stored, local }: MessageAttachmentsProps) {
  if (stored && stored.length > 0 && conversationId) {
    return (
      <Attachments variant="grid">
        {stored.map((file) => (
          <StoredAttachment key={file.id} conversationId={conversationId} messageId={messageId} file={file} />
        ))}
      </Attachments>
    );
  }
  if (local.length === 0) return null;
  return (
    <Attachments variant="grid">
      {local.map((file, i) => (
        <Attachment key={i} data={{ ...file, id: String(i) }} title={file.filename} data-testid="chat-attachment">
          <AttachmentPreview />
        </Attachment>
      ))}
    </Attachments>
  );
}
