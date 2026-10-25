/**
 * Message a household member: pick who, say what. Apps can open it with a
 * `url` so the message links back to what it's about ("the grocery list").
 */

import { useState } from 'react';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useHousehold } from '@rambleraptor/homestead-core/household/useHousehold';
import { useSendMessage } from '../hooks/useSendMessage';

/** The longest title and body the server accepts (`server/messages.ts`). */
const MAX_TITLE = 80;
const MAX_BODY = 500;

export interface SendMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Preselect a recipient by user id. */
  to?: string;
  /** An in-app path the message links to. */
  url?: string;
}

export function SendMessageDialog({ isOpen, onClose, to, url }: SendMessageDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New message">
      {isOpen && <SendMessageForm to={to} url={url} onDone={onClose} />}
    </Modal>
  );
}

function SendMessageForm({ to, url, onDone }: { to?: string; url?: string; onDone: () => void }) {
  const { user } = useAuth();
  const household = useHousehold();
  const send = useSendMessage();
  const toast = useToast();
  const [recipient, setRecipient] = useState(to ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<{ recipient?: string; title?: string }>({});

  const others = (household.data ?? []).filter((m) => m.id !== user?.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = {
      recipient: recipient ? undefined : 'Choose who to send it to',
      title: title.trim() ? undefined : 'Write a message',
    };
    setErrors(next);
    if (next.recipient || next.title) return;
    try {
      await send.mutateAsync({ to: recipient, title: title.trim(), body: body.trim() || undefined, url });
      const name = household.data?.find((m) => m.id === recipient)?.name ?? 'them';
      toast.success(`Sent to ${name}`);
      onDone();
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (household.isError) {
    return (
      <p className="text-sm text-red-600" data-testid="send-message-error">
        The household couldn't be loaded, so there's no one to message right now.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="send-message-form">
      <div>
        <label htmlFor="message-to" className="mb-1 block text-sm font-medium text-gray-700">
          To
        </label>
        <select
          id="message-to"
          data-testid="send-message-to"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          disabled={!household.data}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="">Choose someone…</option>
          {others.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {errors.recipient && <p className="mt-1 text-sm text-red-600">{errors.recipient}</p>}
      </div>
      <div>
        <label htmlFor="message-title" className="mb-1 block text-sm font-medium text-gray-700">
          Message
        </label>
        <Input
          id="message-title"
          data-testid="send-message-title"
          value={title}
          maxLength={MAX_TITLE}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          placeholder="Running late, be there by 6:30"
        />
        {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
      </div>
      <div>
        <label htmlFor="message-body" className="mb-1 block text-sm font-medium text-gray-700">
          More detail <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <textarea
          id="message-body"
          data-testid="send-message-body"
          value={body}
          maxLength={MAX_BODY}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={send.isPending} data-testid="send-message-submit">
          {send.isPending ? 'Sending…' : 'Send'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
