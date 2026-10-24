import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/attachments';
import { usePromptInputAttachments } from '@rambleraptor/homestead-core/shared/components/ai-elements/prompt-input';

/** The files waiting in the composer, each with a remove button. */
export function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <Attachments variant="inline" className="w-full" data-testid="chat-composer-attachments">
      {attachments.files.map((file) => (
        <Attachment
          key={file.id}
          data={file}
          onRemove={() => attachments.remove(file.id)}
          data-testid="chat-composer-attachment"
        >
          <AttachmentPreview />
          <AttachmentInfo className="max-w-40" />
          <AttachmentRemove label={`Remove ${file.filename ?? 'file'}`} />
        </Attachment>
      ))}
    </Attachments>
  );
}
