/**
 * A message to someone in the household (`users/{id}/notifications:send`), as
 * a reply shows it: the message the way it lands in their inbox — who it's
 * for, the title, the text — under a line that says where it stands. Waiting
 * for Approve, it is a preview of exactly what will be sent; after, a receipt.
 */

import { MessageCircle } from 'lucide-react';
import type { ChatCardProps } from '@rambleraptor/homestead-core/apps/types';
import { CardHeadline } from '@rambleraptor/homestead-core/chat/components/GenericActionCard';
import { useHousehold } from '@rambleraptor/homestead-core/household/useHousehold';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

/** The headline for each mode, naming the recipient. */
function headline(mode: ChatCardProps['mode'], to: string): string {
  switch (mode) {
    case 'proposed':
      return `Message for ${to}`;
    case 'running':
      return `Sending to ${to}…`;
    case 'done':
      return `Sent to ${to}`;
    case 'denied':
      return `Not sent to ${to}`;
    case 'failed':
      return `Couldn't send to ${to}`;
  }
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

export function SendMessageCard({ input, mode, error }: ChatCardProps) {
  const household = useHousehold();
  const userId = text(input.user_id)?.split('/').pop();
  const to = (userId && household.data?.find((m) => m.id === userId)?.name) || 'a household member';
  const body = (input.body ?? {}) as Record<string, unknown>;
  const title = text(body.title);
  const message = text(body.body);

  return (
    <div className="min-w-0 text-sm">
      <CardHeadline
        icon={<MessageCircle className="size-4 shrink-0 text-muted-foreground" />}
        running={mode === 'running'}
      >
        {headline(mode, to)}
      </CardHeadline>
      <div
        className={cn(
          'mt-2 rounded-lg border border-gray-100 bg-surface-white p-3',
          (mode === 'denied' || mode === 'failed') && 'opacity-60',
        )}
        data-testid="chat-card-message"
      >
        <p className="font-medium text-brand-navy text-xs" data-testid="chat-card-recipient">
          To {to}
        </p>
        {title && <p className="mt-0.5 break-words font-semibold text-gray-900">{title}</p>}
        {message && <p className="mt-1 whitespace-pre-wrap break-words text-gray-600">{message}</p>}
      </div>
      {mode === 'failed' && (
        <p className="mt-1 text-destructive" role="alert" data-testid="chat-card-error">
          {error || 'The message could not be sent.'}
        </p>
      )}
    </div>
  );
}
