/**
 * The toast for a burst of changes the assistant made while the person was on
 * another screen: the count, and a way to the conversation that made them.
 * Rendered inside a sonner toast (`chat/recordToast.tsx`), which leaves custom
 * JSX unstyled, so the box is ours, like `RecordToast`.
 */

import { Link } from 'react-router-dom';

export interface AssistantChangesToastProps {
  message: string;
  /** The conversation's address, or null when it has none yet. */
  href: string | null;
  onOpen?: () => void;
}

export function AssistantChangesToast({ message, href, onOpen }: AssistantChangesToastProps) {
  return (
    <div
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-surface-white px-4 py-3 text-sm shadow-lg"
      data-testid="assistant-changes-toast"
    >
      <p className="font-medium text-text-main">{message}</p>
      {href && (
        <Link
          to={href}
          onClick={onOpen}
          className="shrink-0 rounded-md bg-brand-navy px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-slate"
          data-testid="assistant-changes-open"
        >
          Open
        </Link>
      )}
    </div>
  );
}
